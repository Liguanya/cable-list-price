/* 六大类识别与定额映射 Node 单测 */
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'data', 'prices.js'));
const A = require(path.join(__dirname, '..', 'js', 'app.js'));

let pass = 0, fail = 0;
function ck(desc, got, want) {
  const ok = got === want;
  if (ok) { pass++; } else { fail++; console.log('  ✗ ' + desc + '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}

function one(name, opts) {
  const it = A.buildItem(name);
  if (opts) {
    if (opts.lay) it.layMode = opts.lay;
    if (opts.wire) it.wireType = opts.wire;
  }
  const q = A.matchQuota(it);
  return { cat: it.category, code: q.code, qname: q.name, inf: q.inferred, list: it.listCode, it };
}

console.log('== 分类识别 ==');
ck('YJV电力电缆', A.classify('铜芯电力电缆 YJV-0.6/1kV-4×35+1×16'), 'power');
ck('YJLV铝电缆', A.classify('铝芯电力电缆 YJLV-4×95'), 'power');
ck('KVV控制电缆', A.classify('KVV-7×1.5 控制电缆'), 'control');
ck('ZR-KVV', A.classify('ZR-KVV-5×10'), 'control');
ck('电缆头', A.classify('1kV户内热缩式电力电缆终端头 YJV-4×70'), 'head');
ck('JDG配管', A.classify('JDG20 电线管 砖混凝土结构明配'), 'conduit');
ck('SC25钢管', A.classify('SC25 镀锌钢管'), 'conduit');
ck('RC50钢管', A.classify('RC50 配管'), 'conduit');
ck('BV配线', A.classify('管内穿线 BV-2.5 铜芯'), 'wiring');
ck('BYJ配线', A.classify('WDZN-BYJ-4 配线'), 'wiring');
ck('RYS软线', A.classify('RYS-2×1.5 多芯软导线'), 'wiring');
ck('KYJY软线', A.classify('KYJY-4×1.0 配线'), 'wiring');
ck('桥架200×100', A.classify('钢制槽式桥架 200×100'), 'bridge');
ck('线槽', A.classify('金属线槽 100×50'), 'bridge');

console.log('== 清单编码 ==');
ck('电力清单', one('YJV-4×35').list, '030409001');
ck('控制清单', one('KVV-7×1.5').list, '030409002');
ck('电缆头清单', one('电缆头 YJV-4×70').list, '030409003');
ck('配管清单', one('JDG20').list, '030412001');
ck('桥架清单', one('桥架 200×100').list, '030412003');
ck('配线清单', one('BV-2.5').list, '030412004');

console.log('== 电力电缆定额 ==');
ck('铜4×35→2-577', one('YJV-4×35+1×16').code, '2-577');
ck('铝4×95→2-568', one('YJLV-4×95').code, '2-568');
ck('铜5×16→2-577', one('WDZ-YJY-5×16').code, '2-577');
ck('铜4×500→2-580顶档', one('YJV-4×500').code, '2-580');

console.log('== 控制电缆定额（按芯数）==');
ck('KVV5芯→2-586(6内)', one('ZR-KVV-5×10').code, '2-586');
ck('KVV7芯→2-587(14内)', one('KVV-7×1.5').code, '2-587');
ck('KVV24芯→2-588', one('KVV-24×1.0').code, '2-588');
ck('KVV37芯→2-589', one('KVV-37×1.0').code, '2-589');
ck('KVV48芯→2-590', one('KVV-48×0.75').code, '2-590');
ck('KVV61芯→2-590超档', one('KVV-61×0.5').code, '2-590');

console.log('== 电缆头（低压/高压）==');
let h1 = one('1kV户内热缩式电力电缆终端头 YJV-4×70');
ck('低压70→2-757', h1.code, '2-757');
ck('低压编号已确认非推断', h1.inf, false);
ck('低压10→2-755', one('1kV冷缩终端头 YJV-4×10').code, '2-755');
ck('低压400→2-762', one('1kV热缩终端头 YJV-4×400').code, '2-762');
let h2 = one('10kV高压电缆头 YJV22-3×70');
ck('高压70→2-764', h2.code, '2-764');
ck('高压35→2-763', one('10kV高压电缆终端头 YJV-3×35').code, '2-763');
ck('高压400→2-768', one('10kV高压电缆终端头 3×400').code, '2-768');
ck('高压清单仍030409003', h2.list, '030409003');

console.log('== 配管：明敷/暗敷 × 电线管/镀锌钢管 ==');
ck('JDG20明→2-1118', one('JDG20电线管', {lay:'surface'}).code, '2-1118');
ck('JDG15明→2-1117', one('JDG15', {lay:'surface'}).code, '2-1117');
ck('JDG50明→2-1122', one('JDG50电线管', {lay:'surface'}).code, '2-1122');
ck('JDG20暗→2-1124', one('JDG20', {lay:'concealed'}).code, '2-1124');
ck('JDG15暗→2-1123', one('JDG15', {lay:'concealed'}).code, '2-1123');
ck('JDG50暗→2-1128', one('JDG50', {lay:'concealed'}).code, '2-1128');
ck('SC15明→2-1139', one('SC15镀锌钢管', {lay:'surface'}).code, '2-1139');
ck('SC25明→2-1141', one('SC25镀锌钢管', {lay:'surface'}).code, '2-1141');
ck('SC150明→2-1149', one('SC150镀锌钢管', {lay:'surface'}).code, '2-1149');
ck('RC100暗→2-1158', one('RC100镀锌钢管', {lay:'concealed'}).code, '2-1158');
ck('SC150暗→2-1160', one('SC150', {lay:'concealed'}).code, '2-1160');
ck('明配名称含明配', /明配/.test(one('JDG20', {lay:'surface'}).qname), true);
ck('暗配名称含暗配', /暗配/.test(one('SC25', {lay:'concealed'}).qname), true);

console.log('== 配线：照明/动力/多芯软线 ==');
ck('BV1.5照明→2-1318', one('BV-1.5配线', {wire:'lighting'}).code, '2-1318');
ck('BYJ2.5照明→2-1319', one('WDZ-BYJ-2.5', {wire:'lighting'}).code, '2-1319');
ck('BV4照明→2-1320', one('BV-4', {wire:'lighting'}).code, '2-1320');
ck('BV2.5动力→2-13xx', (()=>{const c=one('BV-2.5',{wire:'power'}).code;return /^2-13\d\d$/.test(c);})(), true);
ck('BV240动力→2-1355', one('BV-240', {wire:'power'}).code, '2-1355');
ck('RVS2芯→2-1359', one('RYS-2×1.5').code, '2-1359');
ck('KYJY4芯→2-1360', one('KYJY-4×1.0').code, '2-1360');
ck('KYJY16芯→2-1366', one('KYJY-16×1.5').code, '2-1366');

console.log('== 桥架 ==');
ck('桥架150→2-637', one('槽式桥架 150×100').code, '2-637');
ck('桥架200→2-638', one('槽式桥架 200×100').code, '2-638');
ck('桥架800→2-642', one('槽式桥架 800×200').code, '2-642');
ck('桥架1500→2-643', one('槽式桥架 1500×300').code, '2-643');
ck('桥架2000→2-643超档', one('槽式桥架 2000×400').code, '2-643');

console.log('== 行内切换重算 ==');
{
  const it = A.buildItem('JDG20 电线管');
  it.layMode='surface'; let q=A.matchQuota(it); ck('切换前明2-1118', q.code,'2-1118');
  it.layMode='concealed'; q=A.matchQuota(it); ck('切换后暗2-1124', q.code,'2-1124');
}

console.log('== 电缆头：截面xxmm 等非标名称（用户反馈bug回归）==');
(function(){
  const cases=[
    ['电缆头 截面150mm','2-759'],['电缆头 截面50mm','2-757'],['电缆头 截面240mm²','2-760'],
    ['冷缩电缆头 3*120','2-758'],['1kV户内热缩终端头 YJV-4×70','2-757'],
    ['10kV高压电缆终端头 3×70','2-764'],['电缆头 截面400mm','2-762']
  ];
  cases.forEach(([n,code])=>ck(n+'→'+code, one(n).code, code));
  ck('头截面150解析为150', one('电缆头 截面150mm').it.section, 150);
})();

console.log('== 电气材料信息价（天津2026年第9期，除税）==');
(function(){
  const P='2026-09';
  function price(name){
    const it=A.buildItem(name);
    const pi=A.lookupElecPrice(P,it);
    return pi?{v:pi.price,s:pi.source}:null;
  }
  function approx(desc, got, want){ ck(desc+'≈'+want, Math.abs(got-want)<0.011, true); }
  // SC 镀锌钢管（吨价×理论重量换算米价）
  approx('SC150=71.23', price('SC150镀锌钢管').v, 71.23);
  approx('SC50=20.31', price('SC50镀锌钢管').v, 20.31);
  approx('SC25=9.57', price('SC25镀锌钢管').v, 9.57);
  ck('SC为信息价official', price('SC150镀锌钢管').s, 'official');
  // JDG/KBG
  approx('JDG25=10.93(同KBG)', price('JDG25').v, 10.93);
  approx('KBG25=10.93', price('KBG25').v, 10.93);
  approx('JDG20=6.35', price('JDG20').v, 6.35);
  // BV/BVR 单芯电线
  approx('BV2.5=2.46', price('BV-2.5').v, 2.46);
  approx('BV4=3.81', price('BV-4').v, 3.81);
  approx('BVR2.5=2.83', price('BVR-2.5').v, 2.83);
  ck('BV取BV价不取BVR', Math.abs(price('BV-2.5').v-2.46)<0.011 && Math.abs(price('BV-2.5').v-2.83)>0.1, true);
  ck('BV为信息价', price('BV-2.5').s, 'official');
  // BYJ 无独立信息价 → 参照BV(estimated)
  ck('BYJ2.5参照BV为估算', price('BYJ-2.5').s, 'estimated');
  approx('BYJ2.5≈BV2.5', price('BYJ-2.5').v, 2.46);
  // RVS 双绞软线信息价
  approx('RVS2×1.5=3.70', price('RVS-2×1.5').v, 3.70);
  ck('RVS为信息价', price('RVS-2×1.5').s, 'official');
  // RYS 多芯软线无信息价 → null（待询价）
  ck('RYS无信息价返回null', price('RYS-2×1.5'), null);
  // 桥架 宽×高精确
  approx('桥架400×200=233.87', price('电缆桥架 400×200').v, 233.87);
  approx('桥架200×100=80.12', price('桥架200×100').v, 80.12);
  ck('桥架400×200信息价', price('电缆桥架 400×200').s, 'official');
  // 桥架无对应宽度 → 就近估算
  ck('桥架250×100就近估算', price('桥架250×100').s, 'estimated');
  // 控制电缆/电缆头不查电气价
  ck('控制电缆不查电气价', A.lookupElecPrice(P, A.buildItem('KVV-7×1.5')), null);
  ck('电缆头不查电气价', A.lookupElecPrice(P, A.buildItem('电缆头 截面150mm')), null);
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
