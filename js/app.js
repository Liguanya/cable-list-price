/* ============================================================
 * 电缆配管配线桥架自动组价系统 - 核心逻辑
 * 依据：天津市安装工程工程量清单计价指引 DBD29-903-2025（2025-10-01施行）
 *       配套 天津市安装工程预算基价 第二册 电气设备安装工程 DBD29-302-2020
 *
 * 六大类清单编码（官方指引表 D.9 / D.12 核准）：
 *   电力电缆   030409001   控制电缆 030409002   电力电缆头 030409003
 *   配管       030412001   桥架     030412003   配线       030412004
 *
 * 定额分档：
 *   电力电缆敷设 铜2-576~580 / 铝2-566~570（截面10/35/120/240/400）
 *   控制电缆敷设 2-586~590（6/14/24/37/48芯以内）
 *   电力电缆头   1kV / 10kV 户内热(冷)缩终端头（编号见 CABLE_HEAD 表，含核对提示）
 *   配管 电线管(JDG/KBG) 明2-1117~1122 暗2-1123~1128（DN15~50 共6档）
 *        镀锌钢管(SC/RC) 明2-1139~1149 暗2-1150~1160（DN15~150 共11档）
 *   配线 照明(BV/BYJ) 2-1318~1320（1.5/2.5/4）
 *        动力(铜芯) 2-1335起（截面就近档）
 *        多芯软导线(RYS/KYJY/KYY) 2-1359起（按芯数）
 *   桥架 钢制槽式 2-637~643（宽度150~1500）
 *
 * 价格库见 data/prices.js（电力电缆主材 元/m，含税÷1.13除税）
 * ============================================================ */

(function () {
  'use strict';

  // ---------- 清单编码（官方核准）----------
  var LIST = {
    power: '030409001',
    control: '030409002',
    head: '030409003',
    conduit: '030412001',
    bridge: '030412003',
    wiring: '030412004',
    // 照明器具（2025指引 附录D 灯具+插座）
    lampCommon: '030413001',  // 普通灯
    lampDecor: '030413002',   // 装饰灯
    lampFluor: '030413003',   // 荧光灯
    lampFactory: '030413005', // 工厂灯
    lampMedical: '030413007', // 医疗专用灯
    outlet: '030413014'       // 插座
  };
  var LIST_CODE = LIST.power; // 向后兼容（Node测试）

  // ---------- 电力电缆敷设：铜/铝 × 截面五档 ----------
  var POWER_QUOTA = {
    '铝': [
      { code: '2-566', name: '铝芯电力电缆敷设 电缆截面10mm²以内', max: 10 },
      { code: '2-567', name: '铝芯电力电缆敷设 电缆截面35mm²以内', max: 35 },
      { code: '2-568', name: '铝芯电力电缆敷设 电缆截面120mm²以内', max: 120 },
      { code: '2-569', name: '铝芯电力电缆敷设 电缆截面240mm²以内', max: 240 },
      { code: '2-570', name: '铝芯电力电缆敷设 电缆截面400mm²以内', max: Infinity }
    ],
    '铜': [
      { code: '2-576', name: '铜芯电力电缆敷设 电缆截面10mm²以内', max: 10 },
      { code: '2-577', name: '铜芯电力电缆敷设 电缆截面35mm²以内', max: 35 },
      { code: '2-578', name: '铜芯电力电缆敷设 电缆截面120mm²以内', max: 120 },
      { code: '2-579', name: '铜芯电力电缆敷设 电缆截面240mm²以内', max: 240 },
      { code: '2-580', name: '铜芯电力电缆敷设 电缆截面400mm²以内', max: Infinity }
    ]
  };

  // ---------- 控制电缆敷设：按总芯数（2-586=6芯，逐档至2-590=48芯）----------
  var CONTROL_QUOTA = [
    { code: '2-586', name: '控制电缆敷设 电缆6芯以内', max: 6 },
    { code: '2-587', name: '控制电缆敷设 电缆14芯以内', max: 14 },
    { code: '2-588', name: '控制电缆敷设 电缆24芯以内', max: 24 },
    { code: '2-589', name: '控制电缆敷设 电缆37芯以内', max: 37 },
    { code: '2-590', name: '控制电缆敷设 电缆48芯以内', max: 48 }
  ];

  /* ---------- 电力电缆终端头（用户2026-10-26确认，两段连续不重叠） ----------
   * 1kV低压：2-755(10) … 2-762(400)，截面增大编号递增，共8档；
   * 10kV高压：2-763(35) … 2-768(400)，截面增大编号递增，共6档。
   * 截面档：10/35/70/120/185/240/300/400（1kV 8档）；35/70/120/185/240/400（10kV 6档） */
  var HEAD_LV = [
    { code: '2-755', sec: 10 }, { code: '2-756', sec: 35 }, { code: '2-757', sec: 70 },
    { code: '2-758', sec: 120 }, { code: '2-759', sec: 185 }, { code: '2-760', sec: 240 },
    { code: '2-761', sec: 300 }, { code: '2-762', sec: 400 }
  ];
  var HEAD_HV = [
    { code: '2-763', sec: 35 }, { code: '2-764', sec: 70 }, { code: '2-765', sec: 120 },
    { code: '2-766', sec: 185 }, { code: '2-767', sec: 240 }, { code: '2-768', sec: 400 }
  ];

  // ---------- 配管 ----------
  // 电线管(JDG/KBG) DN15/20/25/32/40/50：明 2-1117~1122，暗 2-1123~1128
  var TUBE_DN = [15, 20, 25, 32, 40, 50];
  var TUBE_CODE = { surface: 1117, concealed: 1123 };
  // 镀锌钢管(SC/RC) DN15/20/25/32/40/50/70/80/100/125/150：明 2-1139~1149，暗 2-1150~1160
  var STEEL_DN = [15, 20, 25, 32, 40, 50, 70, 80, 100, 125, 150];
  var STEEL_CODE = { surface: 1139, concealed: 1150 };

  // ---------- 配线 ----------
  // 照明线路 铜芯 BV/BYJ：1.5/2.5/4 → 2-1318/1319/1320（编号确定）
  var LIGHT_SEC = [1.5, 2.5, 4];
  var LIGHT_CODE0 = 1318;
  // 动力线路 铜芯：按截面就近，编号自2-1335起（区间2-1335~1358，逐档编号为推断，需对照基价表）
  var POWER_WIRE_SEC = [0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];
  var POWER_WIRE_CODE0 = 1335;
  // 多芯软导线 RYS/KYJY/KYY：以芯数为主（2/4/6/8/10/12/14/16），编号自2-1359起（区间至2-1373，推断）
  var SOFT_CORES = [2, 4, 6, 8, 10, 12, 14, 16];
  var SOFT_CODE0 = 1359;
  var SOFT_SEC = [0.5, 0.75, 1.0, 1.5];

  // ---------- 桥架：钢制槽式 宽度档（2-637~643，>800套1500档，逐档编号推断）----------
  var BRIDGE_W = [150, 300, 400, 500, 600, 800, 1500];
  var BRIDGE_CODE0 = 637;

  /* ============================================================
   * 照明器具（依据 DBD29-302-2020 第二册 第十三章 照明器具安装，子目名称/编号
   *           已对照中国建筑出版在线官方电子书逐页核准）
   * ----------------------------------------------------------
   * 普通灯具：吸顶灯具按灯罩周长（mm）
   *   2-1539 800以内 | 2-1540 1100以内 | 2-1541 1100以外
   * 其他普通灯具（固定子目）：
   *   2-1542 软线吊灯 | 2-1543 吊链灯 | 2-1544 防水吊灯
   *   2-1545 普通弯脖灯 | 2-1546 普通壁灯 | 2-1547 防水灯头 | 2-1548 座灯头
   * 工厂灯及防水防尘灯：
   *   工厂罩灯 2-1549 吸顶式 / 1550 弯杆式 / 1551 悬挂式 / 1552 吊管式 / 1553 吊链式
   *   防水防尘灯 2-1554 直杆式 / 1555 弯杆式 / 1556 吸顶式
   * 工厂其他灯具：投光灯 2-1560；混光灯 2-1561 吊杆/1562 吊链/1563 嵌入式
   *   密闭灯 安全灯 2-1570 直杆/1571 弯杆；防爆灯 2-1572 直杆/1573 弯杆
   *   高压水银防爆灯 2-1574 直杆/1575 弯杆；防爆荧光灯 2-1576
   * 荧光灯具安装：
   *   组装型 2-1761~1763 吊链式 单/双/三管；2-1764~1766 吸顶式 单/双/三管
   *   成套型 2-1768~1770 吊链式 单/双/三管；2-1771~1773 吊管式 单/双/三管；
   *          2-1774~1776 吸顶式 单/双/三管；2-1777~1780 嵌入式 单/双/三/四管
   * 医院灯具：2-1783 病房指示灯 / 1784 病房暗脚灯 / 1785 紫外线杀菌灯 / 1786 无影灯(吊装)
   * ============================================================ */
  // 吸顶灯具：灯罩周长 mm 上限
  var LAMP_CEIL_PERIM = [800, 1100, Infinity];
  var LAMP_CEIL_CODES = ['2-1539', '2-1540', '2-1541'];
  // 其他普通灯具（关键字 → 固定子目）
  // 注意：更具体的"座灯头"必须排在泛化的"灯头"之前
  var LAMP_PLAIN = [
    { re: /软线吊灯/, code: '2-1542', name: '其他普通灯具安装 软线吊灯' },
    { re: /吊链灯/, code: '2-1543', name: '其他普通灯具安装 吊链灯' },
    { re: /防水吊灯|防水吊线灯/, code: '2-1544', name: '其他普通灯具安装 防水吊灯' },
    { re: /弯脖灯|弯脖子灯|普通弯脖/, code: '2-1545', name: '其他普通灯具安装 普通弯脖灯' },
    { re: /普通壁灯|一般壁灯|壁灯/, code: '2-1546', name: '其他普通灯具安装 普通壁灯' },
    { re: /座灯头|普通座灯/, code: '2-1548', name: '其他普通灯具安装 座灯头' },
    { re: /声光控灯头|声光控|防水灯头|灯头/, code: '2-1547', name: '其他普通灯具安装 防水灯头' }
  ];
  // 工厂灯（按安装方式 + 灯型）。方式→工厂罩灯/防水防尘灯编号
  var LAMP_FACTORY_HOOD = { top: '2-1549', bend: '2-1550', hang: '2-1551', pipe: '2-1552', chain: '2-1553' };
  var LAMP_FACTORY_WP = { top: '2-1556', bend: '2-1555', hang: '2-1554', pipe: '2-1554', chain: '2-1554' };
  var LAMP_FACTORY_HOOD_NAME = { top: '吸顶式', bend: '弯杆式', hang: '悬挂式', pipe: '吊管式', chain: '吊链式' };
  var LAMP_FACTORY_WP_NAME = { top: '吸顶式', bend: '弯杆式', hang: '直杆式', pipe: '直杆式', chain: '直杆式' };
  // 固定子目工厂/密闭/投光混光
  var LAMP_FACTORY_FIXED = [
    { re: /投光灯/, code: '2-1560', name: '工厂其他灯具安装 投光灯' },
    { re: /混光灯/, code: '2-1561', name: '工厂其他灯具安装 混光灯 吊杆式' },
    { re: /防爆荧光/, code: '2-1576', name: '密闭灯具安装 防爆荧光灯' },
    { re: /高压水银/, code: '2-1572', name: '密闭灯具安装 高压水银防爆灯 直杆式' },
    { re: /防爆灯/, code: '2-1572', name: '密闭灯具安装 防爆灯 直杆式' },
    { re: /安全灯/, code: '2-1570', name: '密闭灯具安装 安全灯 直杆式' }
  ];
  // 荧光灯具：组装/成套 × 安装方式 × 管数 → 编号
  // 组装型仅 吊链/吸顶，各1~3管；成套型方式全（吊链/吊管/吸顶/嵌入），嵌入有4管
  var FLUOR_GRID = {
    assembled: { chain: [1761, 1762, 1763], top: [1764, 1765, 1766] },
    complete: {
      chain: [1768, 1769, 1770], pipe: [1771, 1772, 1773],
      top: [1774, 1775, 1776], embed: [1777, 1778, 1779, 1780]
    }
  };
  var FLUOR_MOUNT_NAME = { chain: '吊链式', pipe: '吊管式', top: '吸顶式', embed: '嵌入式' };
  var FLUOR_TUBE_CN = { 1: '单管', 2: '双管', 3: '三管', 4: '四管' };
  // 医院灯具
  var LAMP_MEDICAL = [
    { re: /无影灯|手术灯/, code: '2-1786', name: '医院灯具安装 无影灯（吊装灯）' },
    { re: /病房指示|指示灯(?!.*疏散)/, code: '2-1783', name: '医院灯具安装 病房指示灯' },
    { re: /病房暗脚|暗脚灯|病房专用|病房灯/, code: '2-1784', name: '医院灯具安装 病房暗脚灯' },
    { re: /观片灯/, code: '2-1784', name: '医院灯具安装 病房暗脚灯' },
    { re: /紫外线|消毒灯|杀菌灯/, code: '2-1785', name: '医院灯具安装 紫外线杀菌灯' }
  ];

  /* ============================================================
   * 插座（DBD29-302-2020 第十三章 九、开关按钮插座安装·3插座 / 4防爆插座）
   * 普通插座（成套插座安装）：
   *   单相明插座15A：2孔~12孔 2-1817~1826（11档：2/3/4/5/6/7/8/9/10/11/12孔）
   *   单相明插座30A：3孔 2-1827 / 4孔 2-1828
   *   三相明插座15A 4孔 2-1829；三相明插座30A 4孔 2-1830
   *   单相暗插座15A：2孔~12孔 2-1831~1841（11档）
   *   单相暗插座30A：3孔 2-1842 / 4孔 2-1843 / 5孔(?)→ 实际30A仅3/4孔 2-1842/1843（见下注）
   *   三相暗插座15A 4孔 2-1845；三相暗插座30A 4孔 2-1846
   * 防爆插座（电流档 15/30/60A以内）：
   *   单相 2-1847/1848/1849；单相三孔 2-1850/1851/1852；三相四孔 2-1853/1854/1855
   * 注：暗装单相30A 基价为3孔2-1842、4孔2-1843；2-1844为30A单相暗插座末档（按表确认）。
   * ============================================================ */
  // 明装15A：2~11孔=2-1817~1826（10档，基价表明装无12孔）；暗装15A：2~12孔=2-1831~1841（11档）
  var OUT_HOLES_15A_SURFACE = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  var OUT_HOLES_15A_CONCEAL = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // 普通插座编号矩阵（官方表逐档核准）
  // 明装：单相15A 2~12孔=2-1817~1826；单相30A 3孔=2-1827、4孔=2-1828；三相15A 4孔=2-1829；三相30A 4孔=2-1830
  var OUT_SURFACE_SINGLE15_CODE0 = 1817;
  var OUT_SURFACE = { single30: { 3: '2-1827', 4: '2-1828' }, three15: '2-1829', three30: '2-1830' };
  // 暗装：单相15A 2~12孔=2-1831~1841；单相30A 2孔=2-1842、3孔=2-1843；三相15A 4孔=2-1845；三相30A 4孔=2-1846
  var OUT_CONCEAL_SINGLE15_CODE0 = 1831;
  var OUT_CONCEAL = { single30: { 2: '2-1842', 3: '2-1843' }, three15: '2-1845', three30: '2-1846' };
  // 防爆：电流档 15/30/60A以内。单相1847/48/49，单相三孔1850/51/52，三相四孔1853/54/55
  var OUT_EX_AMP = [15, 30, 60];
  var OUT_EX_CODE = {
    single: [1847, 1848, 1849],
    single3: [1850, 1851, 1852],
    three: [1853, 1854, 1855]
  };

  // ============================================================
  // 分类识别
  // ============================================================
  // ---------- 灯具细分类（普通/装饰/荧光/工厂/医疗）----------
  // 优先级：医疗 > 工厂 > 荧光 > 装饰 > 普通（兜底任何"灯"）
  function classifyLamp(name) {
    // 医疗专用灯
    if (/无影灯|手术灯|观片灯|病房|紫外线|消毒灯|杀菌灯|医用灯/.test(name)) return 'lampMedical';
    // 工厂灯及防水防尘灯 / 工厂其他灯具 / 密闭防爆
    if (/防水防尘|工厂罩|工厂灯|工矿灯|厂房|高挂灯|密闭灯|投光灯|混光灯|防爆灯|防爆荧光|高压水银|安全灯|防潮灯/.test(name)) return 'lampFactory';
    // 荧光灯（T5/T8支架、格栅荧光、LED平板/长条格栅、荧光支架/灯管）
    if (/荧光灯|荧光支架|格栅|平板灯|支架灯|T\s*[58]\b|日光灯管?|灯管|嵌入式无主灯/.test(name)) {
      // "嵌入式无主灯" 用户归装饰灯，单独前置（见装饰判定），故这里剔除
      if (/无主灯/.test(name)) return 'lampDecor';
      return 'lampFluor';
    }
    // 装饰灯
    if (/筒灯|射灯|艺术|花灯|蜡烛灯|点光源|无主灯|标志灯|诱导灯|疏散|安全出口|装饰灯|挂片|串珠|吊式艺术|吸顶艺术|草坪灯|水下灯|几何形状/.test(name)) return 'lampDecor';
    // 普通灯（含各类吸顶/吊灯/壁灯/灯头/座灯/弯脖/圆球/半圆/简易LED），以及其他含"灯"兜底
    if (/灯|光源/.test(name)) return 'lampCommon';
    return '';
  }

  function isOutlet(name) {
    // 插座（含防爆插座）；排除"插座箱"（那是箱体设备）
    return /插座/.test(name) && !/插座箱/.test(name);
  }

  function classify(name) {
    // 插座优先（独立器具）
    if (isOutlet(name)) return 'outlet';
    if (/电缆头|终端头/.test(name)) return 'head';
    // 灯具五类（在电缆/配线兜底之前）
    var lampCat = classifyLamp(name);
    if (lampCat) return lampCat;
    // 控制电缆：含明确控制型号或"控制电缆"字样
    if (/控制电缆|KVV|DJYP|KYJV|KGV|计算机电缆/.test(name)) return 'control';
    if (/桥架|线槽/.test(name)) return 'bridge';
    // 配线：多芯软导线型号 / 单芯电线型号(BV,BYJ,ZR-BV…) / 配线·穿线·导线关键词
    if (/RYS|RYJS|RVS|KYJY|KYY|多芯软导线/.test(name)) return 'wiring';
    if (/(?:^|[^A-Za-z])(?:WDZN?[ABCDE]?|ZN|Z[ABC]?|ZR|NH)?[-\s]?(?:BVVB|BVR|BYJ|BV)(?:[^A-Za-z]|$)/i.test(name)) return 'wiring';
    if (/配线|管内穿线|导线|穿线/.test(name)) return 'wiring';
    // 配管：JDG/KBG/电线管/镀锌钢管/焊接钢管，或独立的 SC/RC 代号
    if (/JDG|KBG|电线管|镀锌钢管|焊接钢管|配管/.test(name)) return 'conduit';
    if (/(?:^|[^A-Za-z])(?:SC|RC)\s*[-\s]?\d{2,3}/.test(name)) return 'conduit';
    if (/电力电缆|电缆/.test(name)) return 'power';
    // 兜底：纯型号写法（如 WDZ-YJY-0.6/1kV-5×16）
    var pm = name.match(MODEL_RE);
    if (pm && /^(?:YJLHV|JLHV|YJLV|YJY|YJV|VLV|VV|BTT[ZV]|NG[AB]T[YZ])/i.test(stripPrefix(pm[0]))) return 'power';
    return '';
  }
  // 配线更精确的型号判定（供 classify 与特征共用）
  function isSoftWire(name) { return /RYS|RYJS|RVS|KYJY|KYY|多芯软导线/.test(name); }

  /* ================ 灯具 / 插座 解析 ================ */
  var CN_NUM = { '一': 1, '二': 2, '两': 2, '双': 2, '三': 3, '四': 4, '单': 1 };

  // 灯具方形/长方形尺寸（mm）：如 100*100、600×600、1200x300，返回周长mm
  function parseLampPerimeter(name) {
    var m = name.match(/(\d{2,4})\s*[xX×*]\s*(\d{2,4})/);
    if (m) return (parseInt(m[1], 10) + parseInt(m[2], 10)) * 2;
    var d = name.match(/[ΦφØ]?\s*(\d{2,4})\s*mm\s*(?:方形|正方形)/);
    if (d) return parseInt(d[1], 10) * 4;
    return null;
  }
  // 是否为LED平板灯（荧光灯清单、但按吸顶灯具周长套定额）
  function isPanelLamp(name) { return /平板灯/.test(name) && !/长条|格栅|支架/.test(name); }
  // 荧光灯管数
  function parseFluorTubes(name) {
    var m = name.match(/([一二两双三四单])\s*管/);
    if (m && CN_NUM[m[1]]) return CN_NUM[m[1]];
    if (/双管/.test(name)) return 2;
    if (/三管/.test(name)) return 3;
    if (/四管/.test(name)) return 4;
    if (/单管/.test(name)) return 1;
    return 1;
  }
  // 荧光灯安装方式：嵌入>吸顶>吊管>吊链
  function parseFluorMount(name) {
    if (/嵌入|嵌装|暗装在吊顶/.test(name)) return 'embed';
    if (/吸顶/.test(name)) return 'top';
    if (/吊管|吊杆/.test(name)) return 'pipe';
    if (/吊链|吊式|吊装/.test(name)) return 'chain';
    return 'chain'; // 默认吊链式
  }
  // 荧光灯组装/成套（默认成套）
  function parseFluorKind(name) { return /组装型|组装/.test(name) ? 'assembled' : 'complete'; }

  // 工厂灯安装方式：弯杆/悬挂(直杆)/吸顶
  function parseFactoryMount(name) {
    if (/弯管|弯杆/.test(name)) return 'bend';
    if (/吸顶/.test(name)) return 'top';
    if (/悬挂|吊链|吊装|吊杆|直杆|高挂|挂式/.test(name)) return 'hang';
    return 'hang'; // 默认悬挂（按用户举例含"悬挂"）
  }
  // 是否防水防尘灯（决定工厂灯罩灯/防水防尘编号）
  function isWaterproofFactory(name) { return /防水防尘|防水|防潮|防尘|密闭/.test(name); }

  // 插座：防爆
  function isOutletEx(name) { return /防爆/.test(name); }
  // 插座：三相
  function isOutletThree(name) { return /三相|3相|四线|四孔/.test(name); }
  // 插座电流(A)
  function parseOutletAmp(name) {
    // 明确标注"30A/60A"才识别，避免把"12孔""15A"中的数字混淆；默认15A
    if (/60\s*[aA]/.test(name)) return 60;
    if (/30\s*[aA]/.test(name)) return 30;
    if (/15\s*[aA]/.test(name)) return 15;
    return 15;
  }
  // 插座孔数：中文"三孔/四孔/五孔"或"3孔/4孔"
  function parseOutletHoles(name) {
    // 先匹配纯阿拉伯数字（如 12孔），避免被中文"十"逻辑截断
    var md = name.match(/(\d{1,2})\s*孔/);
    if (md) return parseInt(md[1], 10);
    var m = name.match(/([一二两双三四五六七八九十]+)\s*孔/);
    if (!m) return null;
    var s = m[1];
    if (s === '十') return 10;
    if (s.indexOf('十') === 0 && s.length === 2) return 10 + (CN_NUM[s[1]] || 0);
    if (s.length === 2 && s[1] === '十') return (CN_NUM[s[0]] || 1) * 10;
    if (CN_NUM[s]) return CN_NUM[s];
    return null;
  }
  function isWireKw(name) { return /配线|穿线|BV|BYJ|RYS|KYJY|KYY|导线/.test(name); }

  // ---------- 材质（铜/铝）----------
  var ALU_MODEL_RE = /(YJLV|VLV|YJLHV|JLHV|YHLV|JKLYJ|JKLJ|NRLH|WLH|BLV|BLX)/i;
  function detectMaterial(name) {
    if (/铝/.test(name)) return '铝';
    if (ALU_MODEL_RE.test(name)) return '铝';
    return '铜';
  }

  // ---------- 型号 ----------
  var MODEL_RE = /(?:WDZN[ABCDE]?|WDZ[ABCDE]?|ZN|Z[ABCDE]|ZR|NH)?[-\s]?(?:KVVRP|KVVP2?|KVV|DJY[PV]+[VPR2]*|KYJ[VY][PR2]*|YJLHV(?:22|23|32)?|JLHV(?:22|23)?|YJLV(?:22|23|32)?|YJY(?:22|23|32)?|YJV(?:22|23|32)?|VLV(?:22|23|32)?|VV(?:22|23|32)?|BTT[ZV]|NG[-\s]?[AB]T[YZ])/i;
  function extractModel(name) {
    var m = name.match(MODEL_RE);
    return m ? m[0].toUpperCase().replace(/^[-\s]+/, '') : '';
  }
  function normModel(m) {
    return (m || '').toUpperCase().replace(/-/g, '').replace(/\s/g, '');
  }
  function stripPrefix(m) {
    return (m || '').toUpperCase().replace(/^(?:WDZN?[ABCDE]?|ZN|Z[ABC]?|ZR|NH)[-\s]?/, '');
  }

  // ---------- 电压等级 ----------
  var VOLT_RE = /(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*[kK]?[vV]|\d+(?:\.\d+)?\s*[kK][vV])/;
  function extractVoltage(name) {
    var m = name.match(VOLT_RE);
    if (!m) return '';
    return m[0].replace(/\s+/g, '').toUpperCase();
  }
  function isHighVoltage(name) {
    return /10\s*k\s*v|8\.7\s*\/\s*15|35\s*k\s*v|高压/.test(name);
  }

  // ---------- 规格（芯数×截面[+芯数×截面]）----------
  var SPEC_GROUP_RE = /(\d+)\s*[xX×*]\s*(\d+(?:\.\d+)?)(?:\s*\+\s*(?:E|PE)?\s*(\d+)\s*[xX×*]\s*(\d+(?:\.\d+)?)?)?/g;
  var BARE_EARTH_RE = /\+\s*(?:E|PE)\s*(\d+(?:\.\d+)?)/g;

  function parseSpec(name) {
    var probe = name.replace(VOLT_RE, ' ');
    var groups = [];
    var m;
    SPEC_GROUP_RE.lastIndex = 0;
    while ((m = SPEC_GROUP_RE.exec(probe)) !== null) {
      groups.push({
        cores: parseInt(m[1], 10),
        section: parseFloat(m[2]),
        cores2: m[3] !== undefined ? parseInt(m[3], 10) : null,
        section2: m[4] !== undefined ? parseFloat(m[4]) : null
      });
    }
    var bare = [];
    var be;
    BARE_EARTH_RE.lastIndex = 0;
    while ((be = BARE_EARTH_RE.exec(probe)) !== null) bare.push(parseFloat(be[1]));

    if (groups.length === 0) {
      var single = probe.match(/(?:^|[^0-9.])(\d{2,3})\s*(?:mm2|mm²|㎟|平方)/i);
      if (single) {
        return { spec: '1×' + single[1], cores: '1', totalCores: 1, section: parseFloat(single[1]), sections: [parseFloat(single[1])] };
      }
      return { spec: '', cores: '', totalCores: 0, section: null, sections: [] };
    }

    var g = groups[groups.length - 1];
    var sections = [g.section];
    var coresStr = String(g.cores);
    var total = g.cores;
    var specStr = g.cores + '×' + g.section;
    if (g.cores2 !== null) {
      sections.push(g.section2);
      total += g.cores2;
      coresStr += '+' + g.cores2;
      specStr += '+' + g.cores2 + '×' + g.section2;
    } else if (bare.length) {
      var eb = bare[bare.length - 1];
      if (sections.indexOf(eb) === -1) {
        sections.push(eb);
        total += 1;
        coresStr += '+1';
        specStr += '+E' + eb;
      }
    }
    return { spec: specStr, cores: coresStr, totalCores: total, section: Math.max.apply(null, sections), sections: sections };
  }

  // ---------- 配线：单根导线截面 / 软线芯数 ----------
  function parseWireSection(name, specInfo) {
    if (specInfo.section !== null) return specInfo.section; // n×s 形式
    var probe = name.replace(VOLT_RE, ' ');
    var m = probe.match(/(?:BVVB|BVR|BYJ|RVS|RYJS|RYS|KYJY|KYY|BV)[^0-9]{0,4}(\d+(?:\.\d+)?)/i);
    if (m) return parseFloat(m[1]);
    var m2 = probe.match(/(\d+(?:\.\d+)?)\s*mm2/i);
    return m2 ? parseFloat(m2[1]) : null;
  }
  function parseSoftCores(name, specInfo) {
    if (specInfo.totalCores > 0) return specInfo.totalCores;
    var m = name.match(/(二|两|三|四|五|六|七|八|九|十|零)?\s*芯/);
    return 0;
  }

  // ---------- 电缆头：主截面 ----------
  // 兼容："电缆头 截面150mm"、"终端头 50mm²"、"YJV-4×70"、"3*70电缆头" 等
  function parseHeadSection(name, specInfo) {
    if (specInfo.section !== null && specInfo.section > 0) return specInfo.section; // n×s 形式已解析
    var probe = name.replace(VOLT_RE, ' ');
    // ① 明确"截面xx"（mm 或 mm² 或平方，可有可无）
    var m1 = probe.match(/截面\s*(\d+(?:\.\d+)?)/);
    if (m1) return parseFloat(m1[1]);
    // ② 独立数字 + mm/mm²/平方（≥10，排除DN/年份等）
    var m2 = probe.match(/(\d{2,3}(?:\.\d+)?)\s*(?:mm2|mm²|㎟|平方|mm)/i);
    if (m2) return parseFloat(m2[1]);
    // ③ n*s / n×s 形式（parseSpec 未覆盖时的兜底，如 3*70）
    var m3 = probe.match(/\d+\s*[xX×*]\s*(\d{2,3}(?:\.\d+)?)/);
    if (m3) return parseFloat(m3[1]);
    return null;
  }

  // ---------- 配管：公称直径 DN ----------
  function parseDiameter(name) {
    var probe = name.replace(/[×xX]\s*\d{2,3}/g, ' '); // 去掉桥架式 200×100 的干扰
    var m = probe.match(/(?:JDG|KBG|SC|RC|DN|Dn|dn|电线管|镀锌钢管|钢管|φ|Φ|￠)[-\s]?(\d{2,3})/i);
    if (m) return parseInt(m[1], 10);
    var m2 = probe.match(/(?:^|[^0-9])(\d{2,3})\s*(?:mm)?(?:\s|$|厚|壁|规格)/);
    return m2 ? parseInt(m2[1], 10) : null;
  }
  function conduitIsSteel(name) {
    return /镀锌钢管|焊接钢管|(?:^|[^A-Za-z])(?:SC|RC)(?:\s*[-]?\s*\d|[^A-Za-z]|$)|钢管/.test(name);
  }
  // 在升序档表中取"以内"档索引；超出末档时夹到末档并由调用方告警
  function tierIndex(tiers, v) {
    for (var i = 0; i < tiers.length; i++) if (v <= tiers[i]) return i;
    return tiers.length - 1;
  }

  // ---------- 桥架：宽度/高度（宽×高）----------
  function parseBridgeWH(name) {
    var m = name.match(/(\d{3,4})\s*[×xX*]\s*(\d{2,4})/);
    if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
    var m2 = name.match(/(?:宽|宽度|W[=\s]?)(\d{3,4})/);
    if (m2) return { w: parseInt(m2[1], 10), h: null };
    return { w: null, h: null };
  }
  function parseBridgeWidth(name) { return parseBridgeWH(name).w; }
  function parseBridgeHeight(name) { return parseBridgeWH(name).h; }

  // ============================================================
  // 定额匹配（按类别 + 行内选择状态）
  // item: { category, material, section, totalCores, diameter, bridgeWidth,
  //         highVoltage, layMode('surface'|'concealed'), wireType('lighting'|'power') }
  // 返回 { code, name, inferred }  inferred=true 表示编号为区间内推算需核对
  // ============================================================
  function matchQuota(it) {
    var i, idx, q, tiers, label, sec;

    if (it.category === 'power') {
      if (it.section === null) return { code: '', name: '', inferred: false };
      tiers = POWER_QUOTA[it.material] || POWER_QUOTA['铜'];
      q = tiers[tierIndex(tiers.map(function (t) { return t.max === Infinity ? 1e9 : t.max; }), it.section)];
      return { code: q.code, name: q.name, inferred: false };
    }

    if (it.category === 'control') {
      if (!it.totalCores) return { code: '', name: '', inferred: false, noTier: true };
      idx = tierIndex(CONTROL_QUOTA.map(function (t) { return t.max; }), it.totalCores);
      q = CONTROL_QUOTA[idx];
      var over = it.totalCores > 48;
      return { code: q.code, name: q.name, inferred: over, overRange: over };
    }

    if (it.category === 'head') {
      var hv = !!it.highVoltage;
      var rows = hv ? HEAD_HV : HEAD_LV;
      if (it.section === null) return { code: '', name: '', inferred: false };
      idx = tierIndex(rows.map(function (r) { return r.sec; }), it.section);
      var r = rows[idx];
      var vtag = hv ? '10kV' : '1kV';
      var overSec = it.section > 400;
      return {
        code: r.code,
        name: vtag + '户内热（冷）缩式电力电缆终端头 电缆截面' + r.sec + 'mm²以内',
        inferred: false,
        overRange: overSec
      };
    }

    if (it.category === 'conduit') {
      var steel = conduitIsSteel(it.name);
      var dnList = steel ? STEEL_DN : TUBE_DN;
      var code0 = steel ? STEEL_CODE[it.layMode] : TUBE_CODE[it.layMode];
      var kind = steel ? '镀锌钢管' : '电线管';
      if (it.diameter === null) return { code: '', name: '', inferred: false, noTier: true };
      idx = tierIndex(dnList, it.diameter);
      var dn = dnList[idx];
      var lay = it.layMode === 'surface' ? '明配' : '暗配';
      var overDN = it.diameter > dnList[dnList.length - 1];
      return {
        code: '2-' + (code0 + idx),
        name: kind + '敷设 砖、混凝土结构' + lay + ' 公称直径' + dn + 'mm以内',
        inferred: false, overRange: overDN
      };
    }

    if (it.category === 'wiring') {
      if (it.softWire) {
        if (!it.softCores) return { code: '', name: '', inferred: false, noTier: true };
        var ci = tierIndex(SOFT_CORES, it.softCores);
        var cs = SOFT_CORES[ci];
        var si = it.section === null ? SOFT_SEC.length - 1 : tierIndex(SOFT_SEC, it.section);
        var csec = SOFT_SEC[Math.min(si, SOFT_SEC.length - 1)];
        return {
          code: '2-' + (SOFT_CODE0 + ci),
          name: '管内穿线 多芯软导线 ' + cnNum(cs) + '芯 导线截面' + csec + 'mm²以内',
          inferred: true
        };
      }
      if (it.wireType === 'lighting') {
        if (it.section === null) return { code: '', name: '', inferred: false, noTier: true };
        idx = tierIndex(LIGHT_SEC, it.section);
        sec = LIGHT_SEC[idx];
        var overL = it.section > 4;
        return {
          code: '2-' + (LIGHT_CODE0 + idx),
          name: '管内穿线 照明线路 铜芯 导线截面' + sec + 'mm²以内',
          inferred: overL, overRange: overL
        };
      }
      // 动力
      if (it.section === null) return { code: '', name: '', inferred: false, noTier: true };
      idx = tierIndex(POWER_WIRE_SEC, it.section);
      sec = POWER_WIRE_SEC[idx];
      var overP = it.section > 240;
      return {
        code: '2-' + (POWER_WIRE_CODE0 + idx),
        name: '管内穿线 动力线路 铜芯 导线截面' + sec + 'mm²以内',
        inferred: true, overRange: overP
      };
    }

    if (it.category === 'bridge') {
      if (it.bridgeWidth === null) return { code: '', name: '', inferred: false, noTier: true };
      idx = tierIndex(BRIDGE_W, it.bridgeWidth);
      var w = BRIDGE_W[idx];
      var overW = it.bridgeWidth > 1500;
      return {
        code: '2-' + (BRIDGE_CODE0 + idx),
        name: '钢制槽式桥架安装 宽度' + w + 'mm以内',
        inferred: true, overRange: overW
      };
    }

    /* ---------- 灯具 ---------- */
    if (it.category === 'lampCommon') {
      var nm = it.name || '';
      // 其他普通灯具固定子目（软线吊灯/吊链灯/防水吊灯/弯脖/壁灯/灯头/座灯头）
      for (var pi = 0; pi < LAMP_PLAIN.length; pi++) {
        if (LAMP_PLAIN[pi].re.test(nm)) {
          return { code: LAMP_PLAIN[pi].code, name: LAMP_PLAIN[pi].name, inferred: false };
        }
      }
      // 圆球/半圆吸顶灯、简易LED吸顶灯、普通吸顶灯 → 吸顶灯具按周长
      var per = (it.lampPerimeter === null || it.lampPerimeter === undefined) ? 0 : it.lampPerimeter;
      var ci2 = per <= 800 ? 0 : (per <= 1100 ? 1 : 2);
      var perLabel = ci2 === 0 ? '800mm以内' : (ci2 === 1 ? '1100mm以内' : '1100mm以外');
      return { code: LAMP_CEIL_CODES[ci2], name: '吸顶灯具安装 灯罩周长' + perLabel, inferred: false };
    }

    if (it.category === 'lampFluor') {
      var fn = it.name || '';
      // LED平板灯（方形/长方形）→ 荧光灯清单 + 吸顶灯具按周长定额
      if (isPanelLamp(fn) || it.fluorPanel) {
        var pp = it.lampPerimeter || 0;
        var pci = pp <= 800 ? 0 : (pp <= 1100 ? 1 : 2);
        var pLabel = pci === 0 ? '800mm以内' : (pci === 1 ? '1100mm以内' : '1100mm以外');
        return { code: LAMP_CEIL_CODES[pci], name: '吸顶灯具安装（LED平板灯）灯罩周长' + pLabel, inferred: false };
      }
      // 管数 / 组装成套 / 安装方式（优先名称解析，行内选择可覆盖：it.fluorTubes/fluorKind/fluorMount）
      var tubes = it.fluorTubes || parseFluorTubes(fn);
      var kind = it.fluorKind || parseFluorKind(fn);
      var mount = it.fluorMount || parseFluorMount(fn);
      var ti2 = tubes - 1;
      var gridRow = FLUOR_GRID[kind][mount];
      var kindCn = kind === 'assembled' ? '组装型' : '成套型';
      if (!gridRow) {
        // 组装型无吊管/嵌入，回退到成套型
        gridRow = FLUOR_GRID.complete[mount] || FLUOR_GRID.complete.chain;
        kindCn = '成套型';
      }
      if (ti2 >= gridRow.length) ti2 = gridRow.length - 1; // 4管仅成套嵌入支持
      if (tubes === 4 && !(kind === 'complete' && mount === 'embed')) {
        // 非"成套嵌入式"无四管子目，回退成套嵌入
        gridRow = FLUOR_GRID.complete.embed; ti2 = 3; kindCn = '成套型'; mount = 'embed';
      }
      return {
        code: '2-' + gridRow[ti2],
        name: '荧光灯具安装 ' + kindCn + ' ' + FLUOR_MOUNT_NAME[mount] + ' ' + (FLUOR_TUBE_CN[ti2 + 1] || (ti2 + 1) + '管'),
        inferred: false
      };
    }

    if (it.category === 'lampFactory') {
      var ffn = it.name || '';
      for (var fi = 0; fi < LAMP_FACTORY_FIXED.length; fi++) {
        if (LAMP_FACTORY_FIXED[fi].re.test(ffn)) {
          return { code: LAMP_FACTORY_FIXED[fi].code, name: LAMP_FACTORY_FIXED[fi].name, inferred: false };
        }
      }
      var fmount = it.factoryMount || parseFactoryMount(ffn);
      if (isWaterproofFactory(ffn) || it.factoryType === 'waterproof') {
        return {
          code: LAMP_FACTORY_WP[fmount],
          name: '工厂灯及防水防尘灯安装 防水防尘灯 ' + LAMP_FACTORY_WP_NAME[fmount],
          inferred: false
        };
      }
      // 普通工厂罩灯（含厂房高挂工矿灯）
      return {
        code: LAMP_FACTORY_HOOD[fmount],
        name: '工厂灯及防水防尘灯安装 工厂罩灯 ' + LAMP_FACTORY_HOOD_NAME[fmount],
        inferred: false
      };
    }

    if (it.category === 'lampMedical') {
      var mn = it.name || '';
      for (var mi = 0; mi < LAMP_MEDICAL.length; mi++) {
        if (LAMP_MEDICAL[mi].re.test(mn)) {
          return { code: LAMP_MEDICAL[mi].code, name: LAMP_MEDICAL[mi].name, inferred: false };
        }
      }
      return { code: '2-1785', name: '医院灯具安装 紫外线杀菌灯', inferred: false };
    }

    /* ---------- 插座 ---------- */
    if (it.category === 'outlet') {
      var on = it.name || '';
      var surface = (it.layMode === 'surface'); // 行内选择：明装/暗装
      var amp = it.outAmp || parseOutletAmp(on);
      var three = it.outThree !== undefined ? it.outThree : isOutletThree(on);
      var holes = it.outHoles || parseOutletHoles(on);

      // 防爆插座（不分明装暗装；电流档15/30/60）
      if (isOutletEx(on)) {
        var ai = amp <= 15 ? 0 : (amp <= 30 ? 1 : 2);
        var exType = three ? 'three' : (/三孔/.test(on) && !/四孔/.test(on) ? 'single3' : 'single');
        var exName = three ? '三相四孔' : (exType === 'single3' ? '单相三孔' : '单相');
        var exCode = OUT_EX_CODE[exType][ai];
        return {
          code: '2-' + exCode,
          name: '防爆插座安装 ' + exName + ' ' + OUT_EX_AMP[ai] + 'A以内',
          inferred: false
        };
      }

      // 三相插座（固定4孔，仅15/30A）
      if (three) {
        var is30t = amp >= 25;
        if (surface) {
          var sc = is30t ? OUT_SURFACE.three30 : OUT_SURFACE.three15;
          return { code: sc, name: '三相明插座' + (is30t ? '30A' : '15A') + ' 4孔', inferred: false };
        }
        var cc = is30t ? OUT_CONCEAL.three30 : OUT_CONCEAL.three15;
        return { code: cc, name: '三相暗插座' + (is30t ? '30A' : '15A') + ' 4孔', inferred: false };
      }

      // 单相插座
      if (surface) {
        if (amp === 30) {
          var h30 = holes === 4 ? 4 : 3;
          return { code: OUT_SURFACE.single30[h30], name: '单相明插座30A ' + h30 + '孔', inferred: false };
        }
        var hs = holes || 3;
        var hsi = Math.max(0, Math.min(OUT_HOLES_15A_SURFACE.length - 1, hs - 2));
        var realHs = OUT_HOLES_15A_SURFACE[hsi];
        return { code: '2-' + (OUT_SURFACE_SINGLE15_CODE0 + hsi), name: '单相明插座15A ' + realHs + '孔', inferred: false };
      }
      // 暗装单相
      if (amp === 30) {
        var hc30 = holes === 2 ? 2 : 3;
        return { code: OUT_CONCEAL.single30[hc30], name: '单相暗插座30A ' + hc30 + '孔', inferred: false };
      }
      var hc = holes || 3;
      var hci = Math.max(0, Math.min(OUT_HOLES_15A_CONCEAL.length - 1, hc - 2));
      var realHc = OUT_HOLES_15A_CONCEAL[hci];
      return { code: '2-' + (OUT_CONCEAL_SINGLE15_CODE0 + hci), name: '单相暗插座15A ' + realHc + '孔', inferred: false };
    }

    return { code: '', name: '', inferred: false };
  }

  function cnNum(n) {
    var map = { 2: '二', 4: '四', 6: '六', 8: '八', 10: '十', 12: '十二', 14: '十四', 16: '十六' };
    return map[n] || String(n);
  }

  // ============================================================
  // 价格库（data/prices.js → window.CABLE_PRICE_PERIODS）
  // ============================================================
  var PLACEHOLDER_PERIOD = { period: 'pending', releaseLabel: '价格库待录入（收到天津信息价后更新）', items: [] };

  function getPeriods() {
    var p = (typeof window !== 'undefined' && window.CABLE_PRICE_PERIODS) || [];
    return p.length ? p : [PLACEHOLDER_PERIOD];
  }
  function getPeriod(periodKey) {
    var ps = getPeriods();
    for (var i = 0; i < ps.length; i++) if (ps[i].period === periodKey) return ps[i];
    return ps[0];
  }

  function mainCoresOf(cores) {
    var m = String(cores || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  function baseFamily(model) {
    return normModel(model)
      .replace(/^(?:WDZN?[ABCDE]?|ZN|Z[ABCDE]?|ZR|NH)/, '')
      .replace(/(?:22|23|32)$/, '');
  }
  function normItem(it) {
    return {
      material: it.material,
      model: normModel(it.model),
      family: baseFamily(it.model),
      cores: (it.cores || '').replace(/\s/g, ''),
      mainCores: it.mainCores ? Number(it.mainCores) : mainCoresOf(it.cores),
      section: Number(it.section),
      price: Number(it.price),
      spec: it.spec || '',
      source: it.source === 'estimated' ? 'estimated' : 'official',
      basis: it.basis || ''
    };
  }

  function nearestEstimate(pool, section, scopeLabel) {
    if (!pool.length) return null;
    var lower = null, upper = null;
    pool.forEach(function (p) {
      if (p.section < section && (!lower || p.section > lower.section)) lower = p;
      if (p.section > section && (!upper || p.section < upper.section)) upper = p;
    });
    function ref(p) { return p.model + ' ' + p.cores + '芯×' + p.section + 'mm²'; }
    if (lower && upper) {
      var price = lower.price + (upper.price - lower.price) * (section - lower.section) / (upper.section - lower.section);
      return {
        price: Math.round(price * 100) / 100,
        basis: '参照' + ref(lower) + '与' + upper.cores + '芯×' + upper.section + 'mm²信息价' + scopeLabel + '插值估算'
      };
    }
    var pick = lower || upper;
    return { price: pick.price, basis: '参照' + ref(pick) + '信息价就近估算（' + scopeLabel + '，请人工复核）' };
  }

  function lookupPrice(periodKey, material, model, cores, section) {
    if (section === null || isNaN(section)) return null;
    var period = getPeriod(periodKey);
    if (!period.items || !period.items.length) return null;
    var items = period.items.map(normItem).filter(function (it) {
      return it.material === material && it.price > 0;
    });
    if (!items.length) return null;
    var nm = normModel(model);
    var fam = baseFamily(model);
    var mc = mainCoresOf(cores);
    cores = (cores || '').replace(/\s/g, '');

    var hit = items.filter(function (it) {
      return it.model === nm && it.cores === cores && it.section === section;
    })[0];
    if (hit) return { price: hit.price, source: hit.source, basis: hit.basis };

    hit = items.filter(function (it) {
      return it.family === fam && it.cores === cores && it.section === section;
    })[0];
    if (hit) return { price: hit.price, source: hit.source, basis: hit.basis };

    var pool, est;
    pool = items.filter(function (it) { return it.family === fam && it.mainCores === mc && it.cores === cores; });
    est = nearestEstimate(pool, section, '同型号同芯结构');
    if (est) return { price: est.price, source: 'estimated', basis: est.basis };

    pool = items.filter(function (it) { return it.mainCores === mc && it.cores === cores; });
    est = nearestEstimate(pool, section, '同芯结构近似型号');
    if (est) return { price: est.price, source: 'estimated', basis: est.basis };

    pool = items.filter(function (it) { return it.family === fam && it.mainCores === mc; });
    est = nearestEstimate(pool, section, '同主芯数近似结构');
    if (est) return { price: est.price, source: 'estimated', basis: est.basis };

    pool = items.filter(function (it) { return it.mainCores === mc; });
    est = nearestEstimate(pool, section, '同材质同芯数最接近档');
    if (est) return { price: est.price, source: 'estimated', basis: est.basis };

    return null;
  }

  // ============================================================
  // 电气材料信息价（配管/配线/桥架）——天津当月信息价，data/prices.js → period.elec
  // 有信息价读信息价(official)；规格无对应档时按相邻档插值估算(estimated)
  // ============================================================
  function elecTable(periodKey) {
    var p = getPeriod(periodKey);
    return (p && p.elec) || null;
  }
  // 在 {规格键:单价} 升序表中精确取值；无精确档则相邻档线性插值，越界取端档
  function interpByKey(table, key) {
    var keys = Object.keys(table).map(Number).filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; });
    if (!keys.length) return null;
    key = Number(key);
    if (table[key] !== undefined) return { price: table[key], exact: true };
    var lower = null, upper = null;
    keys.forEach(function (k) {
      if (k < key) lower = k;
      if (k > key && upper === null) upper = k;
    });
    if (lower !== null && upper !== null) {
      var v = table[lower] + (table[upper] - table[lower]) * (key - lower) / (upper - lower);
      return { price: Math.round(v * 100) / 100, exact: false, lo: lower, hi: upper };
    }
    var pick = (lower !== null) ? lower : upper;
    return { price: table[pick], exact: false, clamp: pick };
  }

  function periodLabel(periodKey) {
    var p = getPeriod(periodKey);
    return (p.releaseLabel || p.period || '');
  }
  function lookupElecPrice(periodKey, it) {
    var e = elecTable(periodKey);
    if (!e) return null;
    var info = periodLabel(periodKey);
    // ---------- 配管 ----------
    if (it.category === 'conduit') {
      if (it.diameter === null) return null;
      if (it.conduitSteel) {
        if (!e.steelConduit) return null;
        var r = interpByKey(e.steelConduit, it.diameter);
        if (!r) return null;
        if (r.exact) return { price: r.price, source: 'official', basis: '天津' + info + '信息价 镀锌焊接钢管SC DN' + it.diameter + '（吨价×GB/T3091理论重量换算，除税）' };
        if (r.clamp !== undefined) return { price: r.price, source: 'estimated', basis: 'SC DN' + it.diameter + '无信息价档，按端档DN' + r.clamp + '信息价就近计，请人工复核' };
        return { price: r.price, source: 'estimated', basis: 'SC DN' + it.diameter + '无信息价档，按DN' + r.lo + '与DN' + r.hi + '信息价插值估算，请人工复核' };
      }
      if (!e.jdgConduit) return null;
      var rj = interpByKey(e.jdgConduit, it.diameter);
      if (!rj) return null;
      if (rj.exact) return { price: rj.price, source: 'official', basis: '天津' + info + '信息价 KBG/JDG电线管 DN' + it.diameter + '（JDG与KBG同价，除税）' };
      if (rj.clamp !== undefined) return { price: rj.price, source: 'estimated', basis: 'JDG/KBG DN' + it.diameter + '无信息价档，按端档DN' + rj.clamp + '信息价就近计，请人工复核' };
      return { price: rj.price, source: 'estimated', basis: 'JDG/KBG DN' + it.diameter + '无信息价档，按DN' + rj.lo + '与DN' + rj.hi + '信息价插值估算，请人工复核' };
    }
    // ---------- 配线 ----------
    if (it.category === 'wiring') {
      if (it.softWire) {
        // RYS/RVS 等双绞/多芯软线：信息价有 RVS(2芯) 按截面；其他多芯软线暂参考市场价
        if (it.wireModel === 'RVS' && e.rvsWire && it.section !== null) {
          var rr = interpByKey(e.rvsWire, it.section);
          if (rr) {
            if (rr.exact) return { price: rr.price, source: 'official', basis: '天津' + info + '信息价 RVS 2×' + it.section + ' 铜芯双绞软线（除税）' };
            return { price: rr.price, source: 'estimated', basis: 'RVS 2×' + it.section + '无信息价档，按相邻档插值估算，请人工复核' };
          }
        }
        return null; // KYJY/KYY/RYS 等多芯软导线信息价缺，暂不自动计价（市场价人工询价）
      }
      if (it.section === null) return null;
      var model = it.wireModel;
      // BYJ 无独立信息价 → 参照同截面 BV 信息价（交联线略贵，按BV价保守计并标注）
      var table = null, famLabel = '';
      if (model === 'BVR' && e.bvrWire) { table = e.bvrWire; famLabel = 'BVR'; }
      else if (e.bvWire) { table = e.bvWire; famLabel = (model === 'BYJ') ? 'BV(BYJ参照)' : 'BV'; }
      if (!table) return null;
      var rw = interpByKey(table, it.section);
      if (!rw) return null;
      var tag = (model === 'BVR') ? 'BVR' : 'BV';
      if (rw.exact) {
        if (model === 'BYJ') return { price: rw.price, source: 'estimated', basis: 'BYJ ' + it.section + 'mm²无独立信息价，参照同截面BV信息价计（交联聚乙烯线，建议人工复核）' };
        return { price: rw.price, source: 'official', basis: '天津' + info + '信息价 ' + tag + ' ' + it.section + 'mm² 铜芯塑料线（除税）' };
      }
      return { price: rw.price, source: 'estimated', basis: tag + ' ' + it.section + 'mm²无信息价档，按相邻档插值估算，请人工复核' };
    }
    // ---------- 桥架 ----------
    if (it.category === 'bridge') {
      if (it.bridgeWidth === null || !e.bridge) return null;
      var w = it.bridgeWidth, h = it.bridgeHeight;
      // 精确 宽x高
      if (h !== null && e.bridge[w + 'x' + h] !== undefined) {
        return { price: e.bridge[w + 'x' + h], source: 'official', basis: '天津' + info + '信息价 钢制槽式电缆桥架 ' + w + '×' + h + '（除税）' };
      }
      // 同宽度内取高度最接近（或该宽仅一档）
      var sameW = Object.keys(e.bridge).filter(function (k) { return parseInt(k, 10) === w; });
      if (sameW.length) {
        var bestK = sameW[0], bestDiff = Infinity;
        sameW.forEach(function (k) {
          var kh = parseInt(k.split('x')[1], 10);
          var diff = (h === null) ? 0 : Math.abs(kh - h);
          if (diff < bestDiff) { bestDiff = diff; bestK = k; }
        });
        var exactH = (h !== null && bestDiff === 0);
        return {
          price: e.bridge[bestK],
          source: exactH ? 'official' : 'estimated',
          basis: exactH
            ? '天津' + info + '信息价 钢制槽式电缆桥架 ' + bestK + '（除税）'
            : '桥架 ' + w + (h ? '×' + h : '') + ' 无完全对应信息价，按同宽规格 ' + bestK + ' 信息价' + (h ? '就近' : '') + '计，请人工复核'
        };
      }
      // 无同宽：按宽度最接近档（取其首档高度）
      var widths = {};
      Object.keys(e.bridge).forEach(function (k) {
        var kw = parseInt(k, 10), kh = parseInt(k.split('x')[1], 10);
        if (widths[kw] === undefined || kh < widths[kw].h) widths[kw] = { h: kh, k: k };
      });
      var wkeys = Object.keys(widths).map(Number).sort(function (a, b) { return a - b; });
      var bw = wkeys[0];
      wkeys.forEach(function (kw) { if (Math.abs(kw - w) < Math.abs(bw - w)) bw = kw; });
      return {
        price: e.bridge[widths[bw].k],
        source: 'estimated',
        basis: '桥架宽' + w + '无信息价档，按最接近宽度 ' + widths[bw].k + ' 信息价就近估算，请人工复核'
      };
    }
    return null;
  }

  // ============================================================
  // 项目特征
  // ============================================================
  var CAT_LABEL = {
    power: '电力电缆', control: '控制电缆', head: '电力电缆头',
    conduit: '配管', wiring: '配线', bridge: '桥架',
    lampCommon: '普通灯', lampDecor: '装饰灯', lampFluor: '荧光灯',
    lampFactory: '工厂灯', lampMedical: '医疗专用灯', outlet: '插座'
  };
  var CAT_WORK = {
    power: '电缆敷设、电缆头制作安装及辅助工作',
    control: '控制电缆敷设及辅助工作',
    head: '电力电缆终端头制作、安装、接地、接线及辅助工作',
    conduit: '管路敷设、固定、接地连接及为完成该项所需的辅助工作',
    wiring: '管内穿线、接线、端子连接及辅助工作',
    bridge: '桥架组对、安装、接地、附件安装及辅助工作',
    lampCommon: '灯具安装、接线、固定、试亮及辅助工作',
    lampDecor: '装饰灯具安装、接线、固定、试亮及辅助工作',
    lampFluor: '荧光灯具安装、接线、固定、试亮及辅助工作',
    lampFactory: '工厂灯具安装、接线、固定、试亮及辅助工作',
    lampMedical: '医院专用灯具安装、接线、固定、调试及辅助工作',
    outlet: '测位画线、打眼、清扫盒子、装插座、接线、装盖及辅助工作'
  };
  function specText(it) {
    // 灯具/插座：不套用电缆的 型号-电压-截面mm² 描述
    if (/^lamp/.test(it.category)) {
      var lp = [];
      if (it.fluorPanel) lp.push('LED平板灯');
      if (it.lampPerimeter) lp.push('灯罩周长' + it.lampPerimeter + 'mm');
      if (it.category === 'lampFluor' && !it.fluorPanel) {
        lp.push(FLUOR_TUBE_CN[it.fluorTubes || 1] + ' ' + (FLUOR_MOUNT_NAME[it.fluorMount] || ''));
      }
      return lp.join(' ');
    }
    if (it.category === 'outlet') {
      return (it.outEx ? '防爆 ' : '') + (it.outThree ? '三相' : '单相') + ' ' + it.outAmp + 'A' +
        (it.outHoles ? ' ' + it.outHoles + '孔' : (it.outThree ? ' 4孔' : '')) +
        (it.layMode === 'concealed' ? ' 暗装' : ' 明装');
    }
    var parts = [];
    if (it.model) parts.push(it.model);
    if (it.voltage) parts.push(it.voltage);
    if (it.spec) parts.push(it.spec + 'mm²');
    if (it.category === 'conduit' && it.diameter !== null) parts.push('DN' + it.diameter);
    if (it.category === 'bridge' && it.bridgeWidth !== null) parts.push('宽' + it.bridgeWidth + 'mm');
    return parts.join('-');
  }
  function featureGLD(it) {
    return [
      '1.名称: ' + it.name,
      '2.规格型号: ' + specText(it),
      '3.其他: 满足招标图纸、招标文件、技术标准及相关图集规范要求'
    ].join('\n');
  }
  function featureJJ(it) {
    return '项目特征：1. ' + it.name + ' 2. 规格型号：' + specText(it) + ' 3. 其他详见招标文件、设计图纸及相关规范\n' +
      '工作内容：1. 购置、安装 2. ' + CAT_WORK[it.category] + ' 3. 参照图纸及招标文件技术要求 4. 满足施工及验收规范 5. 为完成该项所需辅助工作请在综合单价中考虑，达竣工交验标准';
  }
  function generateFeature(format, it) {
    return format === 'jianjing' ? featureJJ(it) : featureGLD(it);
  }

  // ============================================================
  // 输入解析（A序号 B项目名称 C工程量）
  // ============================================================
  function buildItem(name) {
    var category = classify(name);
    if (!category) return null;

    var it = {
      category: category,
      categoryLabel: CAT_LABEL[category],
      name: name,
      material: detectMaterial(name),
      model: extractModel(name),
      voltage: extractVoltage(name),
      highVoltage: isHighVoltage(name),
      spec: '', cores: '', totalCores: 0, section: null,
      diameter: null, bridgeWidth: null, bridgeHeight: null,
      conduitSteel: false, wireModel: '', softCores: 0, softWire: false,
      layMode: 'surface',       // 配管明敷/暗敷；插座明装/暗装
      wireType: 'lighting',     // 配线默认照明，用户可改
      // 灯具
      lampPerimeter: null, fluorPanel: false,
      fluorTubes: 0, fluorKind: '', fluorMount: '',
      factoryMount: '', factoryType: '',
      // 插座
      outEx: false, outThree: false, outAmp: 15, outHoles: null,
      listCode: LIST[category]
    };

    var specInfo = parseSpec(name);
    it.spec = specInfo.spec;
    it.cores = specInfo.cores;
    it.totalCores = specInfo.totalCores;
    it.section = specInfo.section;

    if (category === 'conduit') {
      it.diameter = parseDiameter(name);
      it.conduitSteel = conduitIsSteel(name);
    }
    if (category === 'bridge') {
      var wh = parseBridgeWH(name);
      it.bridgeWidth = wh.w;
      it.bridgeHeight = wh.h;
    }
    if (category === 'head') {
      it.section = parseHeadSection(name, specInfo);
      if (it.section !== null) it.spec = '1×' + it.section;
    }
    if (category === 'wiring') {
      it.softWire = isSoftWire(name);
      it.section = parseWireSection(name, specInfo);
      var wm = name.match(/(BVVB|BVR|BYJ|RVS|RYJS|RYS|KYJY|KYY|BV)/i);
      it.wireModel = wm ? wm[1].toUpperCase() : '';
      it.softCores = it.softWire ? (specInfo.totalCores || parseSoftCores(name, specInfo)) : 0;
    }
    if (category === 'lampCommon' || category === 'lampFluor') {
      it.lampPerimeter = parseLampPerimeter(name);
      it.fluorPanel = isPanelLamp(name);
      it.fluorTubes = parseFluorTubes(name);
      it.fluorKind = parseFluorKind(name);
      it.fluorMount = parseFluorMount(name);
    }
    if (category === 'lampFactory') {
      it.factoryMount = parseFactoryMount(name);
      it.factoryType = isWaterproofFactory(name) ? 'waterproof' : 'hood';
    }
    if (category === 'outlet') {
      it.outEx = isOutletEx(name);
      it.outThree = isOutletThree(name);
      it.outAmp = parseOutletAmp(name);
      it.outHoles = parseOutletHoles(name);
      // 名称含"暗装/暗插"默认暗装，含"明"默认明装，否则默认明装（用户可改）
      if (/暗装|暗插|暗插座/.test(name)) it.layMode = 'concealed';
      else it.layMode = 'surface';
    }
    return it;
  }

  function buildWarn(it, quota) {
    var w = [];
    if (it.category === 'lampDecor' && !quota.code) {
      w.push('装饰灯已套清单030413002；装饰灯具（筒灯/射灯/花灯/标志诱导灯等）安装子目差异大，请按2020基价第二册装饰灯具章节手选定额');
    }
    if (quota.noTier) {
      if (it.category === 'control') w.push('未识别控制电缆芯数，请核对名称（如 KVV-7×1.5）');
      if (it.category === 'conduit') w.push('未识别配管公称直径(DN)，请核对名称（如 JDG20 / SC25）');
      if (it.category === 'wiring') w.push('未识别导线截面/芯数，请核对名称（如 BV-2.5 / RVS-2×1.5）');
      if (it.category === 'bridge') w.push('未识别桥架宽度，请核对名称（如 200×100）');
    }
    if (quota.overRange) {
      if (it.category === 'control') w.push('芯数超48，请改套2-591~594对应子目');
      if (it.category === 'head') w.push('电缆头截面超400mm²，请按基价表对应顶档子目核对');
      if (it.category === 'conduit') w.push('管径超本类最大档，请按基价表更大规格子目核对');
      if (it.category === 'wiring' && !it.softWire) w.push('导线截面超出常规档，请按基价表对应子目核对');
      if (it.category === 'bridge') w.push('桥架宽度超1500mm，请按基价表更大规格子目核对');
    }
    return w.join('；');
  }

  function parseRows(aoa, periodKey, format) {
    var results = [];
    var autoIdx = 0;
    for (var r = 0; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var rawName = row[1];
      var name = (rawName === undefined || rawName === null) ? '' : String(rawName).trim();
      if (!name) continue;
      if ((/序号/.test(String(row[0] || ''))) && (/名称/.test(name))) continue;
      if (/项目名称|电缆名称|名称型号/.test(name) && /名称/.test(name) && !/\d/.test(name) && r < 5) continue;

      var it = buildItem(name);
      if (!it) continue;

      autoIdx++;
      var seqRaw = row[0];
      it.index = (seqRaw !== undefined && seqRaw !== null && String(seqRaw).trim() !== '') ? String(seqRaw).trim() : String(autoIdx);

      var qtyRaw = row[2];
      var qty = parseFloat(qtyRaw);
      it.qtyWarn = false;
      if (isNaN(qty) || qty <= 0) { qty = 1; it.qtyWarn = true; }
      it.quantity = qty;
      it.unit = (it.category === 'head') ? '个' : 'm';

      var quota = matchQuota(it);
      it.quotaCode = quota.code;
      it.quotaName = quota.name;
      it.codeInferred = !!quota.inferred;
      it.warn = buildWarn(it, quota);
      if (it.qtyWarn) it.warn = (it.warn ? it.warn + '；' : '') + '工程量缺失，暂按1' + it.unit + '计请核对';

      // 主材价：电力电缆走电缆价格库；配管/配线/桥架走电气材料信息价；控制电缆/电缆头暂不自动询价
      var priceInfo = null;
      if (it.category === 'power') {
        priceInfo = lookupPrice(periodKey, it.material, it.model, it.cores, it.section);
      } else if (it.category === 'conduit' || it.category === 'wiring' || it.category === 'bridge') {
        priceInfo = lookupElecPrice(periodKey, it);
      }
      if (priceInfo) {
        it.price = priceInfo.price;
        it.priceSource = priceInfo.source;       // official | estimated
        it.priceBasis = priceInfo.basis || '';
      } else {
        it.price = null;
        // 该计价类但查不到价：配线软线等标"待询价"，其余（控制电缆/电缆头）标"未计价"
        var pricedCats = { power: 1, conduit: 1, wiring: 1, bridge: 1 };
        it.priceSource = pricedCats[it.category] ? 'pending' : 'na';
        it.priceBasis = '';
      }

      it.features = generateFeature(format, it);
      results.push(it);
    }
    return results;
  }

  // 行内选择变更后重算该条定额
  function recomputeQuota(it) {
    var q = matchQuota(it);
    it.quotaCode = q.code;
    it.quotaName = q.name;
    it.codeInferred = !!q.inferred;
    it.warn = buildWarn(it, q);
    if (it.qtyWarn) it.warn = (it.warn ? it.warn + '；' : '') + '工程量缺失，暂按1' + it.unit + '计请核对';
  }

  // ============================================================
  // 渲染
  // ============================================================
  var PRICED_CATS = { power: 1, conduit: 1, wiring: 1, bridge: 1 };
  function priceText(item) {
    if (!PRICED_CATS[item.category]) return '<span class="tag tag-na">未计价</span>';
    if (item.price === null) return '<span class="tag tag-pending">待询价</span>';
    var basisTip = item.priceBasis ? ' title="' + String(item.priceBasis).replace(/"/g, '&quot;') + '"' : '';
    if (item.priceSource === 'estimated') return '<span class="tag tag-est" ' + basisTip + '>估</span> <span ' + basisTip + '>¥' + item.price.toFixed(2) + '</span>';
    return '<span class="tag tag-info" ' + basisTip + '>信息价</span> <span ' + basisTip + '>¥' + item.price.toFixed(2) + '</span>';
  }
  function inferTag(it) {
    return it.codeInferred ? '<span class="tag tag-infer" title="定额编号为区间内按截面/芯数/管径/宽度就近推算，名称已按规则生成，请对照2020预算基价第二册子目表核对">推</span>' : '';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function opt(val, cur, label) {
    return '<option value="' + val + '"' + (val === cur ? ' selected' : '') + '>' + label + '</option>';
  }
  function sel(act, idx, html, cls) {
    return '<select class="cell-select' + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-idx="' + idx + '">' + html + '</select>';
  }

  // 敷设方式/选型 列
  function layCell(it) {
    if (it.category === 'conduit') {
      return sel('lay', it._i, opt('surface', it.layMode, '明敷') + opt('concealed', it.layMode, '暗敷'));
    }
    if (it.category === 'wiring') {
      if (it.softWire) return '<span class="lay-static">多芯软导线</span>';
      return sel('wire', it._i, opt('lighting', it.wireType, '照明线路') + opt('power', it.wireType, '动力线路'));
    }
    // 插座：明装/暗装（防爆不分明暗，显示固定徽标）
    if (it.category === 'outlet') {
      if (it.outEx) return '<span class="lay-static">防爆</span>';
      return sel('lay', it._i, opt('surface', it.layMode, '明装') + opt('concealed', it.layMode, '暗装'), 'lay-outlet');
    }
    // 荧光灯：成套/组装 + 安装方式 + 管数（平板灯按周长，无下拉）
    if (it.category === 'lampFluor' && !it.fluorPanel) {
      var kindSel = sel('flKind', it._i,
        opt('complete', it.fluorKind || 'complete', '成套型') + opt('assembled', it.fluorKind || '', '组装型'), 'lay-lamp');
      var mountOpts = { chain: '吊链式', pipe: '吊管式', top: '吸顶式', embed: '嵌入式' };
      var mh = '';
      Object.keys(mountOpts).forEach(function (k) { mh += opt(k, it.fluorMount || 'chain', mountOpts[k]); });
      var mountSel = sel('flMount', it._i, mh, 'lay-lamp');
      var th = '';
      [1, 2, 3, 4].forEach(function (t) { th += opt(String(t), String(it.fluorTubes || 1), (FLUOR_TUBE_CN[t])); });
      var tubeSel = sel('flTube', it._i, th, 'lay-lamp');
      return '<div class="lay-stack">' + kindSel + mountSel + tubeSel + '</div>';
    }
    // 工厂灯：吸顶/弯杆/悬挂 安装方式（防水防尘或工厂罩）
    if (it.category === 'lampFactory' && /工厂罩|防水防尘|防水|防尘|防潮|工矿|厂房|高挂/.test(it.name)) {
      var fm = { top: '吸顶式', bend: '弯杆式', hang: '悬挂式' };
      var fh = '';
      Object.keys(fm).forEach(function (k) { fh += opt(k, it.factoryMount || 'hang', fm[k]); });
      return sel('facMount', it._i, fh, 'lay-lamp');
    }
    if (it.category === 'power' || it.category === 'control' || it.category === 'head') {
      return '<span class="mat-badge mat-' + it.material + '">' + it.material + '芯</span>';
    }
    return '—';
  }

  // 规格列按类别展示关键参数
  function specCell(it) {
    if (it.category === 'conduit') return it.diameter !== null ? 'DN' + it.diameter : '—';
    if (it.category === 'bridge') return it.bridgeWidth !== null ? '宽' + it.bridgeWidth : escapeHtml(it.spec || '—');
    if (it.category === 'wiring') {
      if (it.softWire) return (it.softCores ? cnNum(it.softCores) + '芯 ' : '') + (it.section !== null ? it.section + 'mm²' : '');
      return it.section !== null ? it.section + 'mm²' : (escapeHtml(it.spec) || '—');
    }
    if (it.category === 'control') return escapeHtml(it.spec || '—') + (it.totalCores ? '（' + it.totalCores + '芯）' : '');
    if (it.category === 'head') return (it.highVoltage ? '10kV ' : '1kV ') + (it.section !== null ? it.section + 'mm²' : '');
    // 灯具：普通吸顶/平板灯显示灯罩周长；荧光灯显示管数；插座显示相/电流/孔
    if (/^lamp/.test(it.category)) {
      if (it.category === 'lampFluor') {
        if (it.fluorPanel) return it.lampPerimeter ? '周长' + it.lampPerimeter + 'mm' : '平板灯';
        return FLUOR_TUBE_CN[it.fluorTubes || 1] + ' ' + (FLUOR_MOUNT_NAME[it.fluorMount] || '');
      }
      if ((it.category === 'lampCommon') && it.lampPerimeter) return '周长' + it.lampPerimeter + 'mm';
      return '—';
    }
    if (it.category === 'outlet') {
      return (it.outEx ? '防爆 ' : '') + (it.outThree ? '三相' : '单相') + ' ' + it.outAmp + 'A' + (it.outHoles ? ' ' + it.outHoles + '孔' : '');
    }
    return escapeHtml(it.spec || '—');
  }

  function renderTable(data) {
    var tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    data.forEach(function (item, i) {
      item._i = i;
      var tr = document.createElement('tr');
      if (item.warn) tr.className = 'row-warn';
      tr.innerHTML =
        '<td>' + item.index + '</td>' +
        '<td>' + item.listCode + '</td>' +
        '<td class="cell-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</td>' +
        '<td>' + layCell(item) + '</td>' +
        '<td>' + escapeHtml(item.model || '—') + '</td>' +
        '<td>' + specCell(item) + '</td>' +
        '<td class="cell-sec">' + (item.section !== null && (item.category === 'power' || item.category === 'head' || item.category === 'control') ? item.section : '—') + '</td>' +
        '<td class="cell-qcode">' + (item.quotaCode || '—') + ' ' + inferTag(item) + '</td>' +
        '<td class="cell-qname" title="' + escapeHtml(item.quotaName) + '">' + escapeHtml(item.quotaName || '—') + '</td>' +
        '<td class="cell-price">' + priceText(item) + '</td>' +
        '<td>' + item.quantity + '</td>' +
        '<td class="cell-warn">' + (item.warn ? '<span title="' + escapeHtml(item.warn) + '">⚠️ ' + escapeHtml(item.warn) + '</span>' : '') + '</td>';
      tbody.appendChild(tr);
    });

    bindRowSelects(data);

    var cat = {};
    data.forEach(function (d) { cat[d.category] = (cat[d.category] || 0) + 1; });
    var pending = data.filter(function (d) { return PRICED_CATS[d.category] && d.price === null; }).length;
    var total = data.reduce(function (s, d) { return s + (d.price === null ? 0 : d.price * d.quantity); }, 0);

    document.getElementById('totalCount').textContent = data.length;
    document.getElementById('catPower').textContent = cat.power || 0;
    document.getElementById('catOther').textContent = data.length - (cat.power || 0);
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('totalPrice').textContent = '¥' + total.toFixed(2);
  }

  function bindRowSelects(data) {
    document.querySelectorAll('#tableBody select.cell-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var idx = parseInt(sel.getAttribute('data-idx'), 10);
        var act = sel.getAttribute('data-act');
        var it = data[idx];
        if (!it) return;
        if (act === 'lay') it.layMode = sel.value;
        if (act === 'wire') it.wireType = sel.value;
        // 荧光灯：成套/组装、安装方式、管数
        if (act === 'flKind') it.fluorKind = sel.value;
        if (act === 'flMount') it.fluorMount = sel.value;
        if (act === 'flTube') {
          it.fluorTubes = parseInt(sel.value, 10);
          // 组装型仅支持吊链/吸顶且最多3管，切换时做约束
          if (it.fluorKind === 'assembled' && (it.fluorMount === 'pipe' || it.fluorMount === 'embed')) it.fluorKind = 'complete';
          if (it.fluorKind === 'assembled' && it.fluorTubes > 3) it.fluorTubes = 3;
        }
        // 工厂灯：吸顶/弯杆/悬挂
        if (act === 'facMount') it.factoryMount = sel.value;
        recomputeQuota(it);
        renderTable(data); // 重渲染保留选中值（已写回 it）
      });
    });
  }

  // ============================================================
  // 导出
  // ============================================================
  function num2(v) { return v === null || v === undefined ? '' : Number(v.toFixed(2)); }

  function exportJianjing(data) {
    // A序号 B清单编码 C项目名称 D定额编码 E定额名称 F主材价格 G数量 H项目特征
    var wsData = [['序号', '清单编码', '项目名称', '定额编码', '定额名称', '主材价格', '数量', '项目特征']];
    data.forEach(function (it) {
      wsData.push([it.index, it.listCode, it.name, it.quotaCode, it.quotaName,
        it.price === null ? '' : num2(it.price), it.quantity, it.features]);
    });
    var total = data.reduce(function (s, d) { return s + (d.price === null ? 0 : d.price * d.quantity); }, 0);
    wsData.push([]);
    wsData.push(['合计', '', '', '', '', num2(total), '', '']);

    var ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 42 }, { wch: 10 }, { wch: 36 }, { wch: 12 }, { wch: 8 }, { wch: 60 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '清单定额报价表');
    XLSX.writeFile(wb, '清单定额报价表_建经_' + today() + '.xlsx');
  }

  function exportGLD(data) {
    // 15列：A序号 B项目名称 C类型 D材质 E型号 F规格 G截面 H工程量
    //       I项目编码 J类型 K名称 L项目特征 M单位 N工程量 O主材单价
    var wsData = [['序号', '项目名称', '类型', '材质', '型号', '规格', '截面mm2', '工程量',
      '项目编码', '类型', '名称', '项目特征', '单位', '工程量', '主材单价']];

    var zIdx = 0;
    data.forEach(function (it) {
      // 凡有主材信息价的类别（电力电缆/配管/配线/桥架）均带主材单价并生成Z00741子目下设备行
      var hasPrice = it.price !== null &&
        (it.category === 'power' || it.category === 'conduit' || it.category === 'wiring' || it.category === 'bridge');
      var secVal = (it.section !== null && (it.category === 'power' || it.category === 'head' || it.category === 'control')) ? it.section : '';
      var specVal = specCell(it);

      if (!it.quotaCode) {
        // 关键参数缺失、未套定额：单行待人工处理
        wsData.push([
          it.index, it.name, it.categoryLabel, it.material === '铝' ? '铝' : '铜', it.model, specVal,
          secVal, it.quantity, '', '待人工处理', it.name, '', it.unit, it.quantity, ''
        ]);
        return;
      }

      // 第1行：清单行（仅电力电缆带主材单价 O 列）
      wsData.push([
        it.index, it.name, it.categoryLabel, it.material === '铝' ? '铝' : '铜', it.model, specVal,
        secVal, it.quantity,
        it.listCode, '清单行', it.name, it.features, it.unit, it.quantity,
        hasPrice && it.price !== null ? num2(it.price) : ''
      ]);
      // 第2行：定额行
      wsData.push([
        it.index + '.1', '', '', '', '', '', '', '',
        it.quotaCode, '定额行', it.quotaName, '', it.unit, it.quantity, ''
      ]);
      // 第3行：子目下设备（主材）——仅电力电缆（有信息价主材）生成
      if (hasPrice) {
        zIdx++;
        wsData.push([
          it.index + '.2', '', '', '', '', '', '', '',
          'Z00741-' + String(zIdx).padStart(3, '0'), '子目下设备', it.name, '', it.unit, it.quantity,
          it.price !== null ? num2(it.price) : ''
        ]);
      }
    });

    var total = data.reduce(function (s, d) { return s + (d.price === null ? 0 : d.price * d.quantity); }, 0);
    wsData.push([]);
    wsData.push(['合计', '', '', '', '', '', '', '', '', '', '', '', '', '', num2(total)]);

    var ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 8 }, { wch: 40 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 9 }, { wch: 9 },
      { wch: 13 }, { wch: 10 }, { wch: 40 }, { wch: 52 }, { wch: 6 }, { wch: 9 }, { wch: 12 }
    ];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '清单定额报价表');
    XLSX.writeFile(wb, '清单定额报价表_广联达_' + today() + '.xlsx');
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  // ============================================================
  // 初始化 & 事件
  // ============================================================
  var exportData = [];

  function currentFormat() {
    return (document.querySelector('input[name="software"]:checked') || {}).value || 'guanglianda';
  }
  function currentPeriod() {
    return document.getElementById('periodSelect').value;
  }

  function refreshAll() {
    if (!window._rawAOA) return;
    exportData = parseRows(window._rawAOA, currentPeriod(), currentFormat());
    renderTable(exportData);
    var area = document.getElementById('resultArea');
    var btn = document.getElementById('btnGroup');
    if (exportData.length) {
      area.style.display = 'block';
      btn.style.display = 'flex';
      document.getElementById('statusBar').className = 'status-bar status-ok';
      document.getElementById('statusBar').textContent = '成功解析 ' + exportData.length + ' 条（电缆/控制缆/电缆头/配管/配线/桥架/灯具/插座）；请在"敷设方式/选型"列为配管、配线、插座、荧光灯、工厂灯选择对应选项；黄色行为需人工核对项';
    } else {
      area.style.display = 'none';
      btn.style.display = 'none';
      document.getElementById('statusBar').className = 'status-bar status-err';
      document.getElementById('statusBar').textContent = '未在B列识别到电缆/电缆头/配管/配线/桥架类项目名称，请检查表头是否为：A序号 / B项目名称 / C工程量';
    }
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', function () {
    var sel = document.getElementById('periodSelect');
    getPeriods().forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.period;
      opt.textContent = p.releaseLabel;
      sel.appendChild(opt);
    });

    var fileInput = document.getElementById('excelFile');
    var uploadArea = document.getElementById('uploadArea');

    fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) readFile(file);
    });
    uploadArea.addEventListener('dragover', function (e) { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', function () { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
    });
    uploadArea.addEventListener('click', function () { fileInput.click(); });

    document.querySelectorAll('input[name="software"]').forEach(function (radio) {
      radio.addEventListener('change', refreshAll);
    });
    sel.addEventListener('change', refreshAll);

    document.getElementById('exportBtn').addEventListener('click', function () {
      if (!exportData.length) { alert('没有数据可导出'); return; }
      if (currentFormat() === 'jianjing') exportJianjing(exportData);
      else exportGLD(exportData);
    });
    document.getElementById('resetBtn').addEventListener('click', function () { location.reload(); });
  });

  function readFile(file) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      document.getElementById('statusBar').className = 'status-bar status-err';
      document.getElementById('statusBar').textContent = '请上传 .xlsx / .xls 文件';
      document.getElementById('statusBar').style.display = 'block';
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        var ws = wb.Sheets[wb.SheetNames[0]];
        window._rawAOA = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        document.getElementById('statusBar').style.display = 'block';
        refreshAll();
      } catch (err) {
        document.getElementById('statusBar').className = 'status-bar status-err';
        document.getElementById('statusBar').style.display = 'block';
        document.getElementById('statusBar').textContent = '文件解析失败：' + err.message;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 本地调试/自动化句柄（纯前端、本地计算，无安全影响）
  if (typeof window !== 'undefined') {
    window.__cable = {
      parseRows: parseRows, matchQuota: matchQuota, buildItem: buildItem,
      recomputeQuota: recomputeQuota, getPeriods: getPeriods,
      exportGLD: exportGLD, exportJianjing: exportJianjing,
      getData: function () { return exportData; },
      setAOA: function (aoa) {
        window._rawAOA = aoa;
        exportData = parseRows(aoa, currentPeriod(), currentFormat());
        renderTable(exportData);
        return exportData;
      },
      setLay: function (i, v) { exportData[i].layMode = v; recomputeQuota(exportData[i]); renderTable(exportData); },
      setWire: function (i, v) { exportData[i].wireType = v; recomputeQuota(exportData[i]); renderTable(exportData); }
    };
  }

  // 暴露给Node测试
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      detectMaterial: detectMaterial, extractModel: extractModel, extractVoltage: extractVoltage,
      parseSpec: parseSpec, matchQuota: matchQuota, lookupPrice: lookupPrice, parseRows: parseRows,
      getPeriods: getPeriods, LIST_CODE: LIST_CODE, LIST: LIST, classify: classify,
      buildItem: buildItem, parseDiameter: parseDiameter, parseBridgeWidth: parseBridgeWidth,
      isSoftWire: isSoftWire, recomputeQuota: recomputeQuota,
      lookupElecPrice: lookupElecPrice, parseBridgeWH: parseBridgeWH
    };
  }
})();
