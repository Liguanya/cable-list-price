const WebSocket=require('/root/cable-build/node_modules/ws');
const http=require('http'),fs=require('fs');
const XLSX=require('/root/cable-build/node_modules/xlsx');
const getJson=p=>new Promise((res,rej)=>http.get('http://127.0.0.1:9230'+p,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const inRows=[
 ["序号","项目名称","工程量"],
 [1,"YJV-0.6/1kV 4×35+1×16 铜芯电力电缆",120],
 [2,"YJLV-0.6/1kV 4×95 铝芯电力电缆",200],
 [3,"YJLV22-0.6/1kV 3×240+2×120 铠装铝芯电力电缆",80],
 [4,"WDZ-YJY 5×16 铜芯低烟无卤电缆",60],
 [5,"YJLV 4×500 铝芯电缆",30],
 [6,"KVV 7×1.5 控制电缆",100]
];
const wb=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(inRows),"清单");
const b64=XLSX.write(wb,{bookType:'xlsx',type:'base64'});

(async()=>{
 const tabs=await getJson('/json');
 const page=tabs.find(t=>t.type==='page'&&/^https?:/.test(t.url))||tabs.find(t=>t.type==='page');
 const ws=new WebSocket(page.webSocketDebuggerUrl);
 let id=0;const P=new Map();
 const send=(m,p={})=>new Promise((res,rej)=>{const i=++id;P.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}))});
 await new Promise(r=>ws.on('open',r));
 ws.on('message',d=>{const x=JSON.parse(d);if(x.id&&P.has(x.id)){const{res,rej}=P.get(x.id);P.delete(x.id);x.error?rej(new Error(x.error.message)):res(x.result)}});
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:'https://liguanya.github.io/cable-list-price/?q='+Date.now()});
 await sleep(4500);
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return {__exc:r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text};return r.result&&r.result.value};

 const setup=`(async()=>{
   try{
    window.__cap={};
    XLSX.writeFile=function(wb,name){ window.__cap[name]={sheets:wb.SheetNames,aoa:{}}; wb.SheetNames.forEach(n=>window.__cap[name].aoa[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1})); };
    const b64=${JSON.stringify(b64)};const bin=atob(b64);const a=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
    const inp=document.getElementById('excelFile');
    const f=new File([a],'t.xlsx');const dt=new DataTransfer();dt.items.add(f);
    inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1600));
    const rows=[...document.querySelectorAll('#tableBody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.trim()));
    return JSON.stringify({period:document.getElementById('periodSelect').selectedOptions[0].textContent,rows});
   }catch(e){return JSON.stringify({__fatal:e.message,stack:e.stack});}
 })()`;
 const pr=JSON.parse(await ev(setup));
 if(pr.__fatal){console.log('SETUP FATAL:',pr.__fatal,pr.stack);process.exit(1);}
 console.log('==== 期号:',pr.period,' 表格行数:',pr.rows.length,'====');
 pr.rows.forEach(r=>console.log(r.join(' | ')));

 await ev(`document.querySelector('input[name=software][value=guanglianda]').click();document.getElementById('exportBtn').click();`);
 await sleep(700);
 await ev(`document.querySelector('input[name=software][value=jianjing]').click();document.getElementById('exportBtn').click();`);
 await sleep(700);
 const cap=JSON.parse(await ev('JSON.stringify(window.__cap)'));
 fs.writeFileSync('/root/cable-build/final-cap.json',JSON.stringify(cap,null,1));
 console.log('\n==== 导出文件:',Object.keys(cap).join(', '),'====');
 ws.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
