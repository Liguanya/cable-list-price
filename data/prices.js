/* ============================================================
 * 电缆主材信息价库 —— 天津市工程造价信息 · 中准价·除税价（元/m）
 * ------------------------------------------------------------
 * 每月更新方式：在 CABLE_PRICE_PERIODS 数组"最前面"追加一期，
 * 网站期号下拉自动读取，无需改动其他代码。
 *
 * 每条 item 字段：
 *   material : 铜 / 铝
 *   model    : 电缆型号（YJV / YJV22 / YJLV / YJY ...，不含阻燃耐火前缀亦可）
 *   cores    : 芯结构（如 "1" "2" "3" "4" "5" "3+1" "3+2" "4+1"）
 *   section  : 主芯标称截面 mm²（定额分档与插值均以此为准）
 *   spec     : 信息价原始规格文本（留痕核对用）
 *   price    : 中准价·除税价（元/m）
 *   source   : official=信息价原文；estimated=缺规格按相邻截面估算
 *
 * 缺规格估算由系统按"同材质+同型号+同芯结构相邻截面"自动插值，
 * 因此官方条目只需录入信息价中实际出现的规格档位即可。
 * ============================================================ */
window.CABLE_PRICE_PERIODS = [
  // —— 示例（收到正式信息价后删除本注释并按期追加）——
  // {
  //   period: '2026-10',            // 期号：YYYY-MM
  //   releaseLabel: '2026年第10期',
  //   source: '天津市工程造价信息',
  //   items: [
  //     { material: '铜', model: 'YJV',  cores: '4+1', section: 35,  spec: 'YJV-4×35+1×16',  price: 0, source: 'official' },
  //     { material: '铜', model: 'YJV',  cores: '4+1', section: 70,  spec: 'YJV-4×70+1×35',  price: 0, source: 'official' },
  //     { material: '铝', model: 'YJLV', cores: '4',   section: 120, spec: 'YJLV-4×120',     price: 0, source: 'official' }
  //   ]
  // }
];
