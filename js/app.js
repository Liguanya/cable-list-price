/* ============================================================
 * 电缆智能组价系统 - 核心逻辑
 * 清单：全部电力电缆套 030409001
 * 定额（天津2025）：
 *   铝芯 2-566~2-570（10/35/120/240/400mm2 分档，>400 按 2-570）
 *   铜芯 2-576~2-580（同分档，>400 按 2-580）
 * 价格：天津信息价 中准价·除税价（元/m），价格库见 data/prices.js
 * ============================================================ */

(function () {
  'use strict';

  var LIST_CODE = '030409001'; // 电力电缆

  // ---------- 定额分档 ----------
  // 截面 ≤10 / ≤35 / ≤120 / ≤240 / >240(含400及以上)
  var QUOTA = {
    '铝': [
      { code: '2-566', name: '铝芯电力电缆敷设 电缆截面10mm2以内', max: 10 },
      { code: '2-567', name: '铝芯电力电缆敷设 电缆截面35mm2以内', max: 35 },
      { code: '2-568', name: '铝芯电力电缆敷设 电缆截面120mm2以内', max: 120 },
      { code: '2-569', name: '铝芯电力电缆敷设 电缆截面240mm2以内', max: 240 },
      { code: '2-570', name: '铝芯电力电缆敷设 电缆截面400mm2以内', max: Infinity }
    ],
    '铜': [
      { code: '2-576', name: '铜芯电力电缆敷设 电缆截面10mm2以内', max: 10 },
      { code: '2-577', name: '铜芯电力电缆敷设 电缆截面35mm2以内', max: 35 },
      { code: '2-578', name: '铜芯电力电缆敷设 电缆截面120mm2以内', max: 120 },
      { code: '2-579', name: '铜芯电力电缆敷设 电缆截面240mm2以内', max: 240 },
      { code: '2-580', name: '铜芯电力电缆敷设 电缆截面400mm2以内', max: Infinity }
    ]
  };

  // ---------- 解析：材质（铜/铝）----------
  var ALU_MODEL_RE = /(YJLV|VLV|YJLHV|JLHV|YHLV|JKLYJ|JKLJ|NRLH|WLH|BLV|BLX)/i;
  function detectMaterial(name) {
    if (/铝/.test(name)) return '铝';
    if (ALU_MODEL_RE.test(name)) return '铝';
    return '铜'; // YJV/VV 等及默认均按铜芯
  }

  // ---------- 解析：型号 ----------
  // 前缀(WDZN/WDZ/ZR/NH/Z_A-E 等)可有可无，可带连字符；型号按长到短排列，含 YJY/YJV/YJLV 等
  // 控制电缆型号（KVV/KVVP/DJYP系列等）单列，必须排在 VV 前面避免被截断
  var CTRL_MODEL_RE = /(?:WDZN?[ABCDE]?|ZN|Z[ABC]?|ZR|NH)?[-\s]?(?:KVVRP|KVVP2?|KVV|DJY[PV]+[VPR2]*|KYJV[PR2]*|ZC-KVV)/i;
  var POWER_KW_RE = /电力电缆|电缆/;
  var MODEL_RE = /(?:WDZN[ABCDE]?|WDZ[ABCDE]?|ZN|Z[ABC]|ZR|NH)?[-\s]?(?:KVVRP|KVVP2?|KVV|DJY[PV]+[VPR2]*|KYJV[PR2]*|YJLHV(?:22|23|32)?|JLHV(?:22|23)?|YJLV(?:22|23|32)?|YJY(?:22|23|32)?|YJV(?:22|23|32)?|VLV(?:22|23|32)?|VV(?:22|23|32)?|BTT[ZV]|NG[-\s]?[AB]T[YZ])/i;
  // 是否为可组价的电力电缆型号（匹配去掉阻燃/耐火前缀的规范化型号）
  var POWER_MODEL_RE = /^(?:YJLHV|JLHV|YJLV|YJY|YJV|VLV|VV|BTT[ZV]|NG[AB]T[YZ])/;
  var CTRL_MODEL_NORM_RE = /^(?:KVV|KVVRP|KVVP|DJY|KYJV)/;
  function stripPrefix(m) {
    return (m || '').toUpperCase().replace(/^(?:WDZN?[ABCDE]?|ZN|Z[ABC]?|ZR|NH)[-\s]?/, '');
  }
  function isControlName(name) {
    return /控制电缆|KVV|KVVP|KVVRP|DJYP|KYJV|计算机电缆/.test(name);
  }
  function extractModel(name) {
    var m = name.match(MODEL_RE);
    return m ? m[0].toUpperCase().replace(/^[-\s]+/, '') : '';
  }
  function normModel(m) {
    return (m || '').toUpperCase().replace(/-/g, '').replace(/\s/g, '');
  }

  // ---------- 解析：电压等级 ----------
  var VOLT_RE = /(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*[kK]?[vV]|\d+(?:\.\d+)?\s*[kK][vV])/;
  function extractVoltage(name) {
    var m = name.match(VOLT_RE);
    if (!m) return '';
    return m[0].replace(/\s+/g, '').toUpperCase();
  }

  // ---------- 解析：规格（芯数×截面[+芯数×截面]）----------
  // 如 4x35+1x16 / 5*16 / 3X25+2X16 / 4×185+E95
  var SPEC_GROUP_RE = /(\d+)\s*[xX×*]\s*(\d+(?:\.\d+)?)(?:\s*\+\s*(?:E|PE)?\s*(\d+)\s*[xX×*]\s*(\d+(?:\.\d+)?)?)?/g;
  var BARE_EARTH_RE = /\+\s*(?:E|PE)\s*(\d+(?:\.\d+)?)/g;

  function parseSpec(name) {
    // 先去掉电压段，避免 0.6/1 干扰
    var probe = name.replace(VOLT_RE, ' ');
    var groups = [];
    var m;
    SPEC_GROUP_RE.lastIndex = 0;
    while ((m = SPEC_GROUP_RE.exec(probe)) !== null) {
      groups.push({
        cores: parseInt(m[1], 10),
        section: parseFloat(m[2]),
        cores2: m[3] !== undefined ? parseInt(m[3], 10) : null,
        section2: m[4] !== undefined ? parseFloat(m[4]) : null,
        raw: m[0].replace(/\s+/g, '').toLowerCase().replace(/x/g, '×').replace(/\*/g, '×')
      });
    }
    // +E95 形式的裸截面接地
    var bare = [];
    var be;
    BARE_EARTH_RE.lastIndex = 0;
    while ((be = BARE_EARTH_RE.exec(probe)) !== null) bare.push(parseFloat(be[1]));

    if (groups.length === 0) {
      // 兜底：单芯"300mm2 / 300平方"写法
      var single = probe.match(/(?:^|[^0-9.])(\d{2,3})\s*(?:mm2|mm²|㎟|平方)/i);
      if (single) {
        return { spec: '1×' + single[1], cores: '1', section: parseFloat(single[1]), sections: [parseFloat(single[1])] };
      }
      return { spec: '', cores: '', section: null, sections: [] };
    }

    // 取最靠后且含最大截面的一组（规格一般出现在型号/电压之后）
    var g = groups[groups.length - 1];
    var sections = [g.section];
    var coresStr = String(g.cores);
    var specStr = g.cores + '×' + g.section;
    if (g.cores2 !== null) {
      sections.push(g.section2);
      coresStr += '+' + g.cores2;
      specStr += '+' + g.cores2 + '×' + g.section2;
    } else if (bare.length) {
      // 4×185+E95：接地芯按1芯
      var eb = bare[bare.length - 1];
      // 仅当裸截面未被 group 捕获时追加
      if (sections.indexOf(eb) === -1) {
        sections.push(eb);
        coresStr += '+1';
        specStr += '+E' + eb;
      }
    }
    var maxSection = Math.max.apply(null, sections);
    return { spec: specStr, cores: coresStr, section: maxSection, sections: sections };
  }

  // ---------- 定额匹配 ----------
  function matchQuota(material, section) {
    if (section === null || isNaN(section)) return { code: '', name: '' };
    var tiers = QUOTA[material];
    for (var i = 0; i < tiers.length; i++) {
      if (section <= tiers[i].max) return { code: tiers[i].code, name: tiers[i].name };
    }
    return { code: tiers[tiers.length - 1].code, name: tiers[tiers.length - 1].name };
  }

  // ---------- 疑似非电力电缆提示 ----------
  function suspicious(name, model) {
    if (isControlName(name) || (model && /^(KVV|DJY|KYJV)/i.test(model))) return '控制电缆不属于电力电缆定额(2-566~580)，请改套控制电缆定额';
    if (/光缆|光纤/.test(name)) return '疑似光缆，不属于电力电缆';
    if (/(?:^|[^缆])电线|BV线|^\s*BV|ZR-BV|NH-BV/.test(name)) return '疑似电线，不属于电力电缆';
    return '';
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

  // 芯结构 → 主芯数（第一个数字），单芯=1；用于限定"类似规格"的可比范围
  function mainCoresOf(cores) {
    var m = String(cores || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  // 去阻燃/耐火前缀与铠装后缀，取电缆基型（YJV22→YJV，NH-YJV→YJV）
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
      spec: it.spec || ''
    };
  }

  // 在候选记录集中按主截面就近取值/线性插值（调用方须保证候选"同芯结构可比"）
  function nearestEstimate(pool, section, scopeLabel) {
    if (!pool.length) return null;
    var lower = null, upper = null;
    pool.forEach(function (p) {
      if (p.section < section && (!lower || p.section > lower.section)) lower = p;
      if (p.section > section && (!upper || p.section < upper.section)) upper = p;
    });
    function ref(p) { return p.model + ' ' + p.cores + '芯×' + p.section + 'mm²'; }
    if (lower && upper) {
      // 上下相邻档线性插值（电缆价格与截面近似线性）
      var price = lower.price + (upper.price - lower.price) * (section - lower.section) / (upper.section - lower.section);
      return {
        price: Math.round(price * 100) / 100,
        basis: '参照' + ref(lower) + '与' + upper.cores + '芯×' + upper.section + 'mm²信息价' + scopeLabel + '插值估算'
      };
    }
    // 只有单侧档：就近取最接近一档（不外推），如实标注
    var pick = lower || upper;
    return { price: pick.price, basis: '参照' + ref(pick) + '信息价就近估算（' + scopeLabel + '，请人工复核）' };
  }

  // 返回 { price, source, basis } 或 null
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

    // 1. 材质+型号+芯结构+截面 精确（官方价）
    var hit = items.filter(function (it) {
      return it.model === nm && it.cores === cores && it.section === section;
    })[0];
    if (hit) return { price: hit.price, source: 'official', basis: '' };

    // 2. 材质+基型+芯结构+截面（跨同基型如 YJV/YJV22，官方价）
    hit = items.filter(function (it) {
      return it.family === fam && it.cores === cores && it.section === section;
    })[0];
    if (hit) return { price: hit.price, source: 'official', basis: '' };

    // —— 以下为缺规格估算，严格按"类似规格"分层，单芯/多芯绝不混 ——
    var pool, est;
    // 3. 同材质+同基型+同芯结构 → 相邻截面插值
    pool = items.filter(function (it) {
      return it.family === fam && it.mainCores === mc && it.cores === cores;
    });
    est = nearestEstimate(pool, section, '同型号同芯结构');
    if (est) return { price: est.price, source: 'estimated', basis: est.basis };

    // 4. 同材质+同芯结构（跨同基型如 YJV↔YJY）
    pool = items.filter(function (it) {
      return it.mainCores === mc && it.cores === cores;
    });
    est = nearestEstimate(pool, section, '同芯结构近似型号');
    if (est) return { price: est.price, source: 'estimated', basis: est.basis };

    // 5. 同材质+同基型+同主芯数（芯结构略异，如 4+1↔4）
    pool = items.filter(function (it) {
      return it.family === fam && it.mainCores === mc;
    });
    est = nearestEstimate(pool, section, '同主芯数近似结构');
    if (est) return { price: est.price, source: 'estimated', basis: est.basis };

    // 6. 同材质+同主芯数（最宽松兜底，强制人工复核；单芯不与多芯混）
    pool = items.filter(function (it) { return it.mainCores === mc; });
    est = nearestEstimate(pool, section, '同材质同芯数最接近档');
    if (est) return { price: est.price, source: 'estimated', basis: est.basis };

    return null;
  }

  // ============================================================
  // 项目特征
  // ============================================================
  function specDisplay(model, specInfo, voltage) {
    var parts = [];
    if (model) parts.push(model);
    if (voltage) parts.push(voltage);
    if (specInfo.spec) parts.push(specInfo.spec.replace(/×/g, '×') + 'mm2');
    return parts.join('-');
  }

  function featureGLD(name, model, specInfo, voltage) {
    var lines = [];
    lines.push('1.名称: ' + name);
    lines.push('2.规格型号: ' + specDisplay(model, specInfo, voltage));
    lines.push('3.其他: 满足招标图纸、招标文件、技术标准及相关图集规范要求');
    return lines.join('\n');
  }

  function featureJJ(name) {
    return '项目特征：1. ' + name + ' 2. 其他详见招标文件、设计图纸及相关规范\n' +
      '工作内容：1. 购置、安装 2. 电缆敷设 3. 电缆头制作、安装 4. 参照图纸及招标文件的技术要求 5. 满足施工及验收相关规范要求 6. 为完成该项工作内容所需的辅助工作请投标人在综合单价中考虑，达到竣工交验标准';
  }

  function generateFeature(format, name, model, specInfo, voltage) {
    return format === 'jianjing' ? featureJJ(name) : featureGLD(name, model, specInfo, voltage);
  }

  // ============================================================
  // 输入解析（A序号 B项目名称 C工程量）
  // ============================================================
  function parseRows(aoa, periodKey, format) {
    var results = [];
    var autoIdx = 0;
    for (var r = 0; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var rawName = row[1];
      var name = (rawName === undefined || rawName === null) ? '' : String(rawName).trim();
      if (!name) continue;
      // 跳过表头
      if ((/序号/.test(String(row[0] || ''))) && (/名称/.test(name))) continue;
      if (/项目名称|电缆名称|名称型号/.test(name) && /名称/.test(name) && !/\d/.test(name) && r < 5) continue;

      // 先解析型号/截面，判断是否为有效电缆行（兼容纯型号写法，如 WDZ-YJY-0.6/1kV-5x16）
      var probedModel = extractModel(name);
      var probedSpec = parseSpec(name);
      var hasCableWord = POWER_KW_RE.test(name);
      var isCtrl = isControlName(name) || CTRL_MODEL_NORM_RE.test(stripPrefix(probedModel));
      var hasPowerModel = probedModel && POWER_MODEL_RE.test(stripPrefix(probedModel));
      // 接收条件：含"电缆"字样，或识别出电力/控制型号且带规格；其余行（空行/备注/其他材料）跳过
      var accepted = (hasCableWord || isCtrl || hasPowerModel) && (probedSpec.section !== null || isCtrl);
      if (!accepted) continue;

      autoIdx++;
      var seqRaw = row[0];
      var index = (seqRaw !== undefined && seqRaw !== null && String(seqRaw).trim() !== '') ? String(seqRaw).trim() : String(autoIdx);

      var qtyRaw = row[2];
      var qty = parseFloat(qtyRaw);
      var qtyWarn = false;
      if (isNaN(qty) || qty <= 0) { qty = 1; qtyWarn = true; }

      var material = detectMaterial(name);
      var model = probedModel;
      var voltage = extractVoltage(name);
      var specInfo = probedSpec;
      var quota = matchQuota(material, specInfo.section);
      var priceInfo = lookupPrice(periodKey, material, model, specInfo.cores, specInfo.section);
      var warn = suspicious(name, model);
      if (!isCtrl && !quota.code) warn = (warn ? warn + '；' : '') + '截面未识别，无法套定额，请核对名称规格';
      if (qtyWarn) warn = (warn ? warn + '；' : '') + '工程量缺失，暂按1m计请核对';

      // 控制电缆：保留行，不套电力清单/定额，价格不取，强制人工处理
      if (isCtrl) { quota = { code: '', name: '' }; priceInfo = null; }

      results.push({
        index: index,
        listCode: isCtrl ? '' : LIST_CODE,
        name: name,
        material: material + '芯',
        materialKey: material,
        model: model,
        voltage: voltage,
        spec: specInfo.spec,
        cores: specInfo.cores,
        section: specInfo.section,
        quotaCode: isCtrl ? '' : quota.code,
        quotaName: isCtrl ? '' : quota.name,
        price: priceInfo ? priceInfo.price : null,
        priceSource: priceInfo ? priceInfo.source : 'pending',
        priceBasis: priceInfo ? priceInfo.basis : '',
        unit: 'm',
        quantity: qty,
        features: isCtrl ? '' : generateFeature(format, name, model, specInfo, voltage),
        isControl: isCtrl,
        warn: warn
      });
    }
    return results;
  }

  // ============================================================
  // 渲染
  // ============================================================
  function priceText(item) {
    if (item.price === null) return '<span class="tag tag-pending">待录入</span>';
    if (item.priceSource === 'estimated') return '<span class="tag tag-est">估算</span> ¥' + item.price.toFixed(2);
    return '¥' + item.price.toFixed(2);
  }

  function renderTable(data) {
    var tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    data.forEach(function (item) {
      var tr = document.createElement('tr');
      if (item.warn) tr.className = 'row-warn';
      tr.innerHTML =
        '<td>' + item.index + '</td>' +
        '<td>' + item.listCode + '</td>' +
        '<td class="cell-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</td>' +
        '<td><span class="mat-badge mat-' + item.materialKey + '">' + item.material + '</span></td>' +
        '<td>' + escapeHtml(item.model || '—') + '</td>' +
        '<td>' + escapeHtml(item.spec || '—') + '</td>' +
        '<td>' + (item.voltage || '—') + '</td>' +
        '<td>' + (item.section !== null ? item.section : '—') + '</td>' +
        '<td>' + (item.quotaCode || '—') + '</td>' +
        '<td class="cell-qname" title="' + escapeHtml(item.quotaName) + '">' + escapeHtml(item.quotaName || '—') + '</td>' +
        '<td class="cell-price">' + priceText(item) + '</td>' +
        '<td>' + item.quantity + '</td>' +
        '<td class="cell-warn">' + (item.warn ? '<span title="' + escapeHtml(item.warn) + '">⚠️ ' + escapeHtml(item.warn) + '</span>' : '') + '</td>';
      tbody.appendChild(tr);
    });

    var cu = data.filter(function (d) { return d.materialKey === '铜'; }).length;
    var al = data.filter(function (d) { return d.materialKey === '铝'; }).length;
    var pending = data.filter(function (d) { return d.price === null; }).length;
    var total = data.reduce(function (s, d) { return s + (d.price === null ? 0 : d.price * d.quantity); }, 0);

    document.getElementById('totalCount').textContent = data.length;
    document.getElementById('cuCount').textContent = cu;
    document.getElementById('alCount').textContent = al;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('totalPrice').textContent = '¥' + total.toFixed(2);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
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
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 42 }, { wch: 10 }, { wch: 34 }, { wch: 12 }, { wch: 8 }, { wch: 60 }];
    ws['!rows'] = data.map(function (it) {
      var lines = (it.features.match(/\n/g) || []).length + 1;
      return { hpt: Math.max(lines * 15, 45) };
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '清单定额报价表');
    XLSX.writeFile(wb, '清单定额报价表_建经_' + today() + '.xlsx');
  }

  function exportGLD(data) {
    // 15列（同风口风阀三行结构）：
    // A序号 B项目名称 C类型 D材质 E型号 F规格 G截面 H工程量 I项目编码 J类型 K名称 L项目特征 M单位 N工程量 O主材单价
    var wsData = [['序号', '项目名称', '类型', '材质', '型号', '规格', '截面mm2', '工程量',
      '项目编码', '类型', '名称', '项目特征', '单位', '工程量', '主材单价']];

    var zIdx = 0;
    data.forEach(function (it) {
      // 控制电缆等不套电力定额的项：仅输出单行，编码/价格留空，提示人工处理，不生成设备行
      if (it.isControl || !it.listCode) {
        wsData.push([
          it.index, it.name, '待人工处理', it.material, it.model, it.spec,
          it.section === null ? '' : it.section, it.quantity,
          '', '', '', '', 'm', it.quantity, ''
        ]);
        return;
      }
      // 第1行：清单行
      wsData.push([
        it.index, it.name, '电力电缆', it.material, it.model, it.spec,
        it.section === null ? '' : it.section, it.quantity,
        it.listCode, '清单行', it.name, it.features, 'm', it.quantity,
        it.price === null ? '' : num2(it.price)
      ]);
      // 第2行：定额行
      wsData.push([
        it.index + '.1', '', '', '', '', '', '', '',
        it.quotaCode, '定额行', it.quotaName, '', 'm', it.quantity, ''
      ]);
      // 第3行：子目下设备（主材）
      zIdx++;
      wsData.push([
        it.index + '.2', '', '', '', '', '', '', '',
        'Z00741-' + String(zIdx).padStart(3, '0'), '子目下设备', it.name, '', 'm', it.quantity,
        it.price === null ? '' : num2(it.price)
      ]);
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
      document.getElementById('statusBar').textContent = '成功解析 ' + exportData.length + ' 条电缆，黄色行为需人工核对项';
    } else {
      area.style.display = 'none';
      btn.style.display = 'none';
      document.getElementById('statusBar').className = 'status-bar status-err';
      document.getElementById('statusBar').textContent = '未在B列识别到含"电缆"的项目名称，请检查表头是否为：A序号 / B项目名称 / C工程量';
    }
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', function () {
    // 期号下拉
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

  // 暴露给Node测试
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectMaterial: detectMaterial, extractModel: extractModel, extractVoltage: extractVoltage, parseSpec: parseSpec, matchQuota: matchQuota, lookupPrice: lookupPrice, parseRows: parseRows, getPeriods: getPeriods, LIST_CODE: LIST_CODE };
  }
})();
