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
    wiring: '030412004'
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

  // ============================================================
  // 分类识别
  // ============================================================
  function classify(name) {
    if (/电缆头|终端头/.test(name)) return 'head';
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
    conduit: '配管', wiring: '配线', bridge: '桥架'
  };
  var CAT_WORK = {
    power: '电缆敷设、电缆头制作安装及辅助工作',
    control: '控制电缆敷设及辅助工作',
    head: '电力电缆终端头制作、安装、接地、接线及辅助工作',
    conduit: '管路敷设、固定、接地连接及为完成该项所需的辅助工作',
    wiring: '管内穿线、接线、端子连接及辅助工作',
    bridge: '桥架组对、安装、接地、附件安装及辅助工作'
  };
  function specText(it) {
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
      layMode: 'surface',       // 配管默认明敷，用户可改
      wireType: 'lighting',     // 配线默认照明，用户可改
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
    return it;
  }

  function buildWarn(it, quota) {
    var w = [];
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

  // 敷设方式/线路 列：配管→明/暗下拉，配线→照明/动力(多芯软线置灰)，电缆/桥架→材质徽标
  function layCell(it) {
    if (it.category === 'conduit') {
      return '<select class="cell-select" data-act="lay" data-idx="' + it._i + '">' +
        '<option value="surface"' + (it.layMode === 'surface' ? ' selected' : '') + '>明敷</option>' +
        '<option value="concealed"' + (it.layMode === 'concealed' ? ' selected' : '') + '>暗敷</option>' +
        '</select>';
    }
    if (it.category === 'wiring') {
      if (it.softWire) return '<span class="lay-static">多芯软导线</span>';
      return '<select class="cell-select" data-act="wire" data-idx="' + it._i + '">' +
        '<option value="lighting"' + (it.wireType === 'lighting' ? ' selected' : '') + '>照明线路</option>' +
        '<option value="power"' + (it.wireType === 'power' ? ' selected' : '') + '>动力线路</option>' +
        '</select>';
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
      document.getElementById('statusBar').textContent = '成功解析 ' + exportData.length + ' 条（电缆/控制缆/电缆头/配管/配线/桥架），配管、配线请在表内选择敷设方式与线路类型；黄色行为需人工核对项';
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
