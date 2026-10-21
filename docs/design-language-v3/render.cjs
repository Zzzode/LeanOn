// Design-only SVG renderer. This does not import or modify application code.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const out = __dirname;
const C = {canvas:'#F8F7F4',paper:'#FFFFFF',ink:'#28242C',muted:'#69616B',line:'#E5DED8',control:'#EEEBE6',keyboard:'#E4DFE6',brand:'#573C58',brandTint:'#F0E7F1',food:'#C35445',foodText:'#93392F',foodTint:'#FBEAE4',exercise:'#177D89',exerciseText:'#11606B',exerciseTint:'#E3F1F1',weight:'#7563B1',weightText:'#5E4C96',weightTint:'#EDEAF7',water:'#BD8532',waterText:'#805619',waterTint:'#FBF0D9',partner:'#B75B7B',partnerText:'#91435F',partnerTint:'#F8E7EF',danger:'#B63D46'};
const D = {canvas:'#201D26',paper:'#2B2731',ink:'#FAF5F3',muted:'#CEC3CE',line:'#443D48',control:'#37323D',keyboard:'#2F2934',brand:'#D3B2D8',brandTint:'#403047',food:'#F09B84',foodText:'#F09B84',foodTint:'#49312C',exercise:'#70C7CC',exerciseText:'#70C7CC',exerciseTint:'#213B40',weight:'#BCAAF0',weightText:'#BCAAF0',weightTint:'#39314A',water:'#E7BE71',waterText:'#E7BE71',waterTint:'#443823',partner:'#EAA6BF',partnerText:'#EAA6BF',partnerTint:'#482E3C',danger:'#FF949C'};
let p = C;
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const rect = (x,y,w,h,r,fill,stroke='none') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
const txt = (x,y,s,size=16,color=p.ink,weight=400,extra='') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(s)}</text>`;
const line = (x,y,x2,y2,c=p.line,w=1,extra='') => `<path d="M${x} ${y}L${x2} ${y2}" fill="none" stroke="${c}" stroke-width="${w}" ${extra}/>`;
const circle = (x,y,r,c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
function icon(name,x,y,c=p.brand,s=24){
 const paths={health:'M12 20C4 15 1 10 4 6c3-3 6-1 8 2 2-3 5-5 8-2 3 4 0 9-8 14z',info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6M12 7v1',reminder:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4',food:'M5 3v7m4-7v7M3 7h8m-4 3v11M17 3v18m0-18c5 4 5 9 0 9',weight:'M4 5h16v16H4zM8 9c2-3 6-3 8 0m-4 0 2-3',exercise:'M8 5h8M6 9v6m12-6v6M3 10v4m18-4v4M6 12h12',water:'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0C19 11 15 7 12 2z',partner:'M12 20C4 15 1 10 4 6c3-3 6-1 8 2 2-3 5-5 8-2 3 4 0 9-8 14z',plus:'M12 4v16M4 12h16',chevron:'M9 6l6 6-6 6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',check:'M4 12l5 5L20 6',close:'M5 5l14 14M19 5 5 19',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',arrow:'M4 12h16M14 6l6 6-6 6'};
 return `<g transform="translate(${x} ${y}) scale(${s/24})" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]||paths.plus}"/></g>`;
}
const pill=(x,y,w,label,bg,fg=p.brand)=>rect(x,y,w,28,10,bg)+txt(x+w/2,y+19,label,12,fg,600,'text-anchor="middle"');
const card=(x,y,w,h,color=p.paper)=>rect(x,y,w,h,20,color);
const num=(x,y,s,size=48,c=p.ink)=>txt(x,y,s,size,c,500,'font-family="Avenir Next, Helvetica Neue, sans-serif" style="font-variant-numeric:tabular-nums" letter-spacing="-1.2"');
const markRaw = fs.readFileSync(path.resolve(out,'../../assets/logo-monochrome.svg'),'utf8').match(/<g fill="currentColor">([\s\S]*?)<\/g>/)[1];
const mark=(x,y,s,c=p.brand)=>`<g transform="translate(${x} ${y}) scale(${s/1254})" fill="${c}">${markRaw}</g>`;
function header(title,subtitle,identity=false){
 const status=txt(24,34,'9:41',14,p.ink,600)+rect(174,15,54,17,9,p.ink)+line(326,29,326,24,p.ink,2)+line(331,29,331,21,p.ink,2)+line(336,29,336,18,p.ink,2)+rect(345,20,21,10,3,'none',p.ink)+rect(347,22,15,6,1,p.ink);
 return status+(identity?mark(24,58,20)+txt(51,75,'LeanOn',16,p.brand,500):'')+txt(378,74,'示例',12,p.muted,400,'text-anchor="end"')+txt(24,119,title,27,p.ink,600)+(subtitle?txt(24,148,subtitle,14,p.muted):'');
}
const bars = {};
function nativeBar(name){return `<image x="16" y="788" width="370" height="79" href="${bars[name]}"/>`;}
function base(content,name,theme=C,bar=true){p=theme;return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="402" height="874" viewBox="0 0 402 874"><style>text{font-family:PingFang SC,Helvetica Neue,sans-serif}</style><defs><clipPath id="screen"><rect width="402" height="874" rx="38"/></clipPath></defs><g clip-path="url(#screen)">${rect(0,0,402,874,0,theme.canvas)}${content}${bar?nativeBar(name):rect(135,850,132,5,3,theme.ink)}</g></svg>`;}
function action(x,w,label,type,primary=false){
 return (primary?rect(x,171,w,48,12,p[type+'Text']):'')+icon(type,x+12,184,primary?p.paper:p[type+'Text'],21)+txt(x+42,201,label,15,primary?p.paper:p.ink,500);
}
function today(dark=false){
 p=dark?D:C;let s=header('今天，慢慢来。','10 月 1 日 · 周四',true);
 s+=action(24,132,'记饮食','food',true)+action(168,98,'体重','weight')+action(278,100,'运动','exercise');
 s+=rect(24,241,354,176,22,p.paper)+txt(44,271,'今天的饮食',15,p.foodText,500)+icon('check',303,254,p.foodText,18)+txt(328,269,'已记录',13,p.muted);
 s+=num(44,329,'1,310',52)+txt(196,328,'kcal',15,p.muted)+rect(44,346,314,6,3,p.line)+rect(44,346,183,6,3,p.food)+line(307,340,307,358,p.muted,1.5);
 s+=txt(44,382,'参考 1,881',14,p.muted)+txt(213,382,'运动估算 +367',14,p.exerciseText)+txt(44,405,'余量 938 kcal',14,p.ink,500);
 s+=icon('weight',24,450,p.weightText,21)+txt(54,466,'今日体重',14,p.muted)+num(24,515,'80.4',32)+txt(104,514,'kg',14,p.muted)+txt(24,546,'已记录 · 查看进展',14,p.weightText);
 s+=line(199,448,199,550,p.line)+icon('exercise',221,450,p.exerciseText,21)+txt(251,466,'运动 · 估算',14,p.muted)+num(221,515,'61',32)+txt(269,514,'min',14,p.muted)+txt(221,546,'2 次 · 367 kcal',14,p.exerciseText);
 s+=line(24,577,378,577)+icon('food',24,607,p.foodText,21)+txt(54,624,'营养',20,p.ink,500)+txt(378,623,'g',14,p.muted,400,'text-anchor="end"');
 [['蛋白质','80.7'],['碳水','156'],['脂肪','36.3']].forEach((a,i)=>{let x=24+i*121;s+=txt(x,659,a[0],14,p.muted)+num(x,699,a[1],26);});
 s+=line(24,727,378,727)+icon('water',24,746,p.waterText,18)+txt(53,761,'饮水记录 · iOS 暂不可用',14,p.muted);
 return base(s,'today',p,!dark);
}
function progress(){
 p=C;let s=header('进展','9 月 25 日 — 10 月 1 日');
 s+=rect(24,171,354,44,12,p.control)+rect(28,175,171,36,9,p.paper)+txt(113,199,'近 7 天',14,p.ink,500,'text-anchor="middle"')+txt(285,199,'近 30 天',14,p.muted,400,'text-anchor="middle"');
 s+=rect(24,239,354,341,22,p.paper)+txt(44,269,'体重变化',15,p.weightText,500)+num(44,323,'−0.6',48)+txt(165,321,'kg',16,p.muted)+txt(44,349,'最新 80.4 kg',14,p.muted)+txt(358,269,'7 次记录',13,p.muted,400,'text-anchor="end"');
 const values=[81,81.1,81.2,80.9,80.5,80.3,80.4],lo=80.2,hi=81.4,x0=52,y0=383,w=272,h=129;
 [81.4,80.8,80.2].forEach(v=>{let y=y0+(hi-v)/(hi-lo)*h;s+=line(x0,y,x0+w,y,p.line)+txt(332,y+4,v.toFixed(1),11,p.muted);});
 const pts=values.map((v,i)=>[x0+i*w/6,y0+(hi-v)/(hi-lo)*h]);
 s+=`<path d="M${pts.map(a=>a.join(' ')).join('L')}" fill="none" stroke="${p.weight}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
 const mean=values.reduce((a,b)=>a+b)/7,slope=values.reduce((a,v,i)=>a+(i-3)*(v-mean),0)/28;
 s+=line(x0,y0+(hi-(mean-3*slope))/(hi-lo)*h,x0+w,y0+(hi-(mean+3*slope))/(hi-lo)*h,p.weightText,1.5,'stroke-dasharray="5 4"');pts.forEach(a=>s+=circle(a[0],a[1],3.5,p.weight));
 s+=txt(49,536,'9/25',11,p.muted)+txt(176,536,'9/28',11,p.muted)+txt(298,536,'10/1',11,p.muted)+circle(48,557,3,p.weight)+txt(59,561,'记录',12,p.muted)+line(111,557,132,557,p.weightText,1.5,'stroke-dasharray="5 4"')+txt(140,561,'趋势',12,p.muted)+txt(357,561,'目标 72 kg',12,p.muted,400,'text-anchor="end"');
 s+=icon('food',24,613,p.foodText,22)+txt(57,630,'7 天平均饮食',16,p.ink,400)+txt(57,654,'7 / 7 天有记录',14,p.muted)+num(253,639,'1,692',25)+txt(341,637,'kcal',13,p.muted)+line(24,678,378,678);
 s+=icon('exercise',24,704,p.exerciseText,22)+txt(57,721,'今日运动',16,p.ink,400)+txt(57,745,'2 次记录 · 估算值',14,p.muted)+num(292,731,'61',26)+txt(337,729,'min',13,p.muted);
 return base(s,'progress');
}
function paired(x,y,scale=1){
 return `<g transform="translate(${x} ${y}) scale(${scale})"><g transform="rotate(9 66 96)">${rect(41,39,52,96,26,C.weightTint)}${circle(67,23,11,C.weight)}</g><g transform="rotate(-9 116 96)">${rect(90,34,52,101,26,C.partnerTint)}${circle(116,18,11,C.partner)}</g>${line(34,140,153,140,C.brand,2,'stroke-linecap="round"')}</g>`;
}
function partner(){
 p=C;let s=header('一起','伴侣功能尚未开放',true);
 s+=paired(110,189,1)+txt(24,390,'一起，慢慢变好。',26,p.ink,500)+txt(24,430,'不用比较谁更快。',16,p.muted)+txt(24,460,'散步、吃饭，或一句关心。',16,p.muted);
 s+=line(24,505,378,505)+txt(24,542,'当前状态',17,p.ink,500)+icon('lock',24,565,p.partnerText,20)+txt(56,582,'你的记录保存在本机。',16,p.ink)+txt(24,614,'还没有伴侣连接、同步或消息发送。',14,p.muted);
 s+=txt(24,680,'查看设置',16,p.brand,500)+icon('arrow',112,663,p.brand,21);
 return base(s,'partner');
}
function diary(){
 p=C;let s=header('饮食日记','10 月 1 日 · 今日汇总');
 s+=rect(24,177,354,195,22,p.paper)+txt(44,207,'已记录摄入',15,p.foodText,500)+num(44,265,'1,310',52)+txt(195,263,'kcal',15,p.muted)+rect(44,296,314,48,12,p.foodText)+icon('plus',124,309,p.paper,22)+txt(154,327,'添加食物',16,p.paper,500);
 s+=txt(24,419,'营养',20,p.ink,500)+txt(378,419,'g',14,p.muted,400,'text-anchor="end"');
 [['蛋白质','80.7'],['碳水化合物','156'],['脂肪','36.3']].forEach((a,i)=>{let y=452+i*65;s+=txt(24,y+20,a[0],16,p.ink)+txt(378,y+20,a[1],22,p.ink,500,'text-anchor="end"')+line(24,y+41,378,y+41);});
 s+=txt(24,690,'最近选过',17,p.ink,500)+rect(24,709,106,40,11,p.foodTint)+txt(77,735,'白米饭',15,p.foodText,500,'text-anchor="middle"')+txt(151,734,'点按继续添加',14,p.muted)+txt(24,775,'每日总量 · 尚无逐餐历史',14,p.muted);
 return base(s,'diary');
}
function row(y,label,detail,type,last=false,tappable=false){
 return icon(type,24,y+16,['health','reminder','info','settings'].includes(type)?p.ink:(p[type+'Text']||p.brand),21)+txt(57,y+30,label,16,p.ink,400)+txt(57,y+53,detail,14,p.muted)+(tappable?icon('chevron',358,y+25,p.muted,18):'')+(last?'':line(57,y+70,378,y+70));
}
function me(){
 p=C;let s=header('我的','');
 s+=rect(24,158,354,137,22,p.paper)+txt(44,195,'本机档案',20,p.ink,500)+txt(358,194,'本机模式',14,p.muted,400,'text-anchor="end"')+line(44,218,358,218)+txt(44,254,'身高',14,p.muted)+txt(94,254,'178 cm',16,p.ink,500)+txt(208,254,'目标',14,p.muted)+txt(255,254,'72 kg',16,p.ink,500);
 s+=txt(24,346,'应用',17,p.ink,500)+row(362,'应用设置','语言与本机数据说明','settings',false,true)+row(433,'关于 LeanOn','版本与应用说明','info',true,true);
 s+=txt(24,558,'连接与工具',17,p.ink,500)+row(574,'健康数据','iOS 当前未接入 HealthKit','health')+row(645,'蓝牙体重秤','此版本尚未开放','weight')+row(716,'提醒','iOS 暂不可用','reminder',true);
 return base(s,'me');
}
function settings(){
 p=C;let s=header('设置','');s+=txt(24,75,'‹ 返回',16,p.brand,500);
 s+=txt(24,165,'通用',14,p.muted)+rect(24,183,354,118,20,p.paper)+txt(44,213,'语言',16,p.ink,400)+rect(44,231,314,48,11,p.control)+rect(48,235,150,40,8,p.paper)+txt(123,261,'简体中文',15,p.ink,500,'text-anchor="middle"')+txt(276,261,'English',15,p.muted,400,'text-anchor="middle"');
 s+=txt(24,348,'连接',17,p.ink,500)+row(362,'Apple 健康','尚未接入 · 暂无同步','health')+row(433,'提醒与通知','iOS 暂不可用','reminder',true);
 s+=line(24,530,378,530)+txt(24,568,'本机数据',17,p.ink,500)+icon('lock',24,589,p.brand,20)+txt(56,606,'记录保存在这台设备',16,p.ink)+txt(24,640,'当前没有账户、云备份或双人同步。',14,p.muted)+line(24,668,378,668)+txt(24,708,'关于 LeanOn',16,p.ink)+icon('chevron',358,691,p.muted,18);
 return base(s,'settings');
}
function formHeader(title,detail,color){
 return txt(24,34,'9:41',14,p.ink,600)+rect(174,15,54,17,9,p.ink)+txt(24,95,'取消',16,p.muted)+txt(24,151,title,27,p.ink,600)+txt(24,180,detail,14,p.muted);
}
function weightForm(){
 p=C;let s=formHeader('记录体重','10 月 1 日 · 更新当天记录',p.weightText);
 s+=txt(24,244,'体重',16,p.ink)+num(24,321,'80.4',56)+txt(176,320,'kg',18,p.muted)+line(24,342,378,342,p.weight,1.5)+txt(24,377,'点按数字输入，保留一位小数。',14,p.muted);
 s+=rect(24,526,354,52,12,p.weightText)+txt(201,559,'保存今天的体重',16,p.paper,500,'text-anchor="middle"');
 s+=rect(0,629,402,245,0,p.keyboard);[['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']].forEach((a,r)=>a.forEach((v,c)=>{s+=rect(6+c*132,637+r*49,126,43,6,p.paper)+txt(69+c*132,666+r*49,v,25,p.ink,400,'text-anchor="middle"');}));s+=txt(201,848,'系统数字键盘 · 设计示意',12,p.muted,400,'text-anchor="middle"');return base(s,'weight',C,false);
}
function foodForm(){
 p=C;let s=formHeader('添加食物','选择食物，确认份量。',p.foodText);
 s+=rect(24,213,354,48,11,p.paper,p.line)+icon('search',39,225,p.muted,22)+txt(76,245,'白米饭',16,p.ink)+icon('close',347,228,p.muted,16);
 s+=icon('food',24,294,p.foodText,23)+txt(61,314,'白米饭 · 熟',18,p.ink,500)+txt(61,342,'每 100 g · 130 kcal',14,p.muted)+icon('check',350,298,p.foodText,22)+line(24,368,378,368);
 s+=txt(24,409,'份量',16,p.ink)+rect(24,430,354,70,11,p.paper,p.food)+num(44,478,'100',40)+txt(350,477,'g',16,p.muted,400,'text-anchor="end"');
 s+=txt(24,555,'本次添加',15,p.foodText,500)+num(24,611,'130',28)+txt(95,609,'kcal',15,p.muted)+txt(200,559,'蛋白质  2.7 g',14,p.muted)+txt(200,586,'碳水  28 g',14,p.muted)+txt(200,613,'脂肪  0.3 g',14,p.muted);
 s+=txt(24,703,'保存后计入今日汇总。',14,p.muted)+line(24,759,378,759)+rect(24,779,354,52,12,p.foodText)+txt(201,812,'添加到今天',16,p.paper,500,'text-anchor="middle"');return base(s,'food',C,false);
}
function exerciseForm(){
 p=C;let s=formHeader('编辑运动','10 月 1 日 · 快走',p.exerciseText);
 s+=txt(24,229,'运动类型',16,p.ink)+icon('exercise',24,256,p.exerciseText,24)+txt(63,277,'快走',20,p.ink,500)+txt(63,304,'已选择',14,p.muted)+icon('check',350,264,p.exerciseText,22)+line(24,333,378,333);
 s+=txt(24,384,'时长',16,p.ink)+rect(24,407,354,70,11,p.paper,p.exercise)+num(44,455,'25',40)+txt(350,454,'min',16,p.muted,400,'text-anchor="end"');
 s+=txt(24,534,'消耗估算',15,p.exerciseText,500)+num(24,594,'127',28)+txt(95,593,'kcal',15,p.muted)+txt(200,553,'按时长与体重计算',14,p.muted)+txt(200,582,'不是设备测量结果',14,p.muted);
 s+=txt(24,702,'保存会更新这一条运动记录。',14,p.muted)+line(24,759,378,759)+rect(24,779,354,52,12,p.exerciseText)+txt(201,812,'保存修改',16,p.paper,500,'text-anchor="middle"');return base(s,'exercise',C,false);
}
function svgRoot(w,h,content){return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>text{font-family:PingFang SC,Helvetica Neue,sans-serif}</style>${content}</svg>`;}
const img=(file,x,y,w,h)=>`<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${fs.readFileSync(path.join(out,file)).toString('base64')}"/>`;
function boardHeader(n,title,subtitle,w){p=C;return rect(0,0,w,160,0,C.canvas)+mark(52,40,40)+txt(104,71,'LeanOn  /  SOFT MOMENTUM',23,C.brand,600)+txt(w-52,70,n,20,C.muted,500,'text-anchor="end"')+txt(52,121,title,30,C.ink,600)+txt(52,152,subtitle,16,C.muted);}
async function write(name,svg,scale=1){fs.writeFileSync(path.join(out,name+'.svg'),svg);await sharp(Buffer.from(svg)).resize({width:Math.round(Number(svg.match(/width="(\d+)"/)[1])*scale)}).png().toFile(path.join(out,name+'.png'));}
function brandBoard(){
 p=C;let s=rect(0,0,1800,1650,0,p.canvas)+boardHeader('01 / BRAND + COMPONENTS · v3','轻一点，靠近一点。','多色语义保留；阅读秩序交给空间、字体和准确的强调。静态设计提案',1800);
 s+=mark(56,216,48,p.brand)+txt(123,252,'LeanOn',42,p.brand,500)+txt(56,326,'Lighter days. Together.',36,p.ink,500)+txt(56,373,'品牌出现在需要陪伴的时刻，工具页直接说明功能。',20,p.muted)+paired(1190,224,1)+txt(1430,275,'两个节奏，',26,p.ink,500)+txt(1430,315,'一条支撑线。',26,p.ink,500);
 s+=line(52,424,1748,424)+txt(52,478,'01  多色服务识别，不给每个区块填背景',24,p.ink,600)+txt(52,514,'单屏以 80–90% 中性空间为构图目标；强色约 3–5%，浅色只在必要的选择与状态中出现。',17,p.muted);
 const roles=[['品牌','brand','brandTint'],['饮食','food','foodTint'],['运动','exercise','exerciseTint'],['体重','weight','weightTint'],['饮水','water','waterTint'],['关系','partner','partnerTint']];
 roles.forEach((a,i)=>{let x=52+i*285;s+=rect(x,543,260,109,14,p.paper)+circle(x+32,575,12,p[a[1]])+txt(x+60,584,a[0],21,p.ink,500)+txt(x+20,628,p[a[1]],15,p.muted);});
 s+=txt(52,690,'青蓝只指运动；琥珀只指饮水。宏量营养使用中性数字，提醒与通用工具用中性图标。',17,p.muted);
 s+=txt(52,758,'02  一个主数字，其他信息回到合适的层级',24,p.ink,600)+txt(52,805,'今天，慢慢来。',27,p.ink,600)+txt(52,838,'标题 26–28 / 600 · 常规行 16 / 400–500 · 状态说明 14',17,p.muted)+num(52,931,'1,310',52)+txt(209,929,'kcal',16,p.muted)+num(418,931,'80.4',32)+txt(502,929,'kg',14,p.muted)+txt(52,987,'系统字体 + 苹方 · 等宽数字 · 保留单位 · 不靠低对比度制造精致感',17,p.muted);
 s+=txt(920,758,'03  只让主动作成为色块',24,p.ink,600)+rect(920,800,241,52,12,p.foodText)+icon('food',947,815,p.paper,23)+txt(984,833,'记饮食',16,p.paper,500)+icon('weight',1220,815,p.weightText,23)+txt(1260,833,'体重',16,p.ink,500)+icon('exercise',1410,815,p.exerciseText,23)+txt(1450,833,'运动',16,p.ink,500);
 s+=rect(920,888,828,62,11,p.paper,p.line)+icon('search',940,908,p.muted,23)+txt(982,928,'搜索食物',16,p.muted)+txt(920,987,'主卡 20–24 / 控件 10–12 · 每屏 1–2 个主要容器，其余开放排版',17,p.muted);
 s+=line(52,1042,1748,1042)+txt(52,1098,'04  深色，同样克制',24,p.ink,600)+rect(52,1120,819,242,22,D.canvas)+txt(80,1164,'今天的饮食',16,D.foodText,500)+num(80,1234,'1,310',48,D.ink)+txt(227,1232,'kcal',16,D.muted)+rect(80,1260,734,5,3,D.line)+rect(80,1260,426,5,3,D.food)+txt(80,1324,'深色表面 + 类别线条，保持可读对比度。',17,D.muted);
 s+=txt(920,1138,'空间与动态',23,p.ink,500)+txt(920,1185,'4 pt 网格 / 页面边距 24 / 主要区块间距 24–32',18,p.muted)+txt(920,1226,'按压 120 ms / 弹层 180–220 ms / 减少动态时淡入',18,p.muted)+txt(920,1267,'图标 24 px / 1.8 px 圆线端 / iOS 44 pt、Android 48 dp',18,p.muted)+txt(920,1325,'原生底栏形态、颜色和动画保持不变。',18,p.brand,500);
 s+=line(52,1420,1748,1420)+txt(52,1471,'保留温度，降低表达频率。',22,p.ink,500)+txt(52,1514,'Today 与 Partner 可以有人情味；Me 与 Settings 用直接功能语言。',18,p.muted)+txt(52,1557,'不庆祝少吃、不比较身体、不把缺失记录补零；Logo 原轮廓保留，装饰图形不替代 Logo。',17,p.muted)+txt(52,1601,'比例是构图指导，不是已量测的像素结论；小屏、大字体、键盘和辅助技术仍须原生验证。',16,p.muted);
 return svgRoot(1800,1650,s);
}
function screensBoard(names,title,subtitle,number,rows=1){p=C;let h=rows===1?1450:2630,s=rect(0,0,1800,h,0,p.canvas)+boardHeader(number,title,subtitle,1800);names.forEach((a,i)=>{let col=i%3,row=Math.floor(i/3),x=92+col*565,y=239+row*1170;s+=txt(x,y-23,a[1],23,p.ink,600)+rect(x-8,y-8,458,979,46,'#29242C')+img(a[0]+'.png',x,y,442,961)+txt(x,y+1002,a[2],16,p.muted);});s+=line(52,h-113,1748,h-113)+txt(52,h-72,'设计稿 · 402 × 874 pt · 示例日期 2026-10-01 · 示例数据源为隔离 QA 记录',17,p.muted)+txt(52,h-39,number.includes('FORMS')?'表单隐藏底栏；系统数字键盘为静态设计示意，未替代原生输入。':'底栏静态图从 iPhone 17 Pro / iOS 26.5 实际页面裁切复用；内容区为新的设计提案。',16,p.muted);return svgRoot(1800,h,s);}
function statesBoard(){
 p=C;let s=rect(0,0,1800,1730,0,p.canvas)+boardHeader('05 / STATES + DARK · v3','状态清楚，表达克制','减少状态胶囊和大色块；错误、忙碌与功能边界仍保持清楚。静态设计提案',1800);
 s+=txt(65,211,'深色 Today',24,p.ink,500)+rect(61,236,434,919,42,'#0F0D12')+img('today-dark.png',69,244,418,909)+txt(65,1191,'沿用现有原生底栏主题与动画。',16,p.muted)+txt(65,1217,'此深色内容稿未绘制底栏。',16,p.muted);
 const states=[['空态','先留下第一个数字。','尚无体重记录；提供清楚的下一步。','记录体重','weight'],['加载','正在读取本机记录…','可取消读取；保留内容布局，避免闪白。','取消','brand'],['校验','请输入 20–300 kg 的体重','输入旁解释问题，保留已填内容。','0 kg','danger'],['保存中','正在保存…','阻止重复写入；待写入结束再关闭。','保存中…','brand'],['保存失败','这次没有保存成功','保留表单与数值，允许重试或取消。','重试保存','danger'],['平台不可用','iOS 暂未接入 Apple 健康','当前不可连接或同步，不绘制已连接。','知道了','partner']];
 states.forEach((a,i)=>{const x=548+(i%2)*602,y=238+Math.floor(i/2)*330,c=p[a[4]+'Text']||p[a[4]];s+=rect(x,y,565,296,20,p.paper)+txt(x+24,y+42,a[0],14,a[4]==='danger'?p.danger:p.muted)+txt(x+24,y+96,a[1],23,p.ink,500)+txt(x+24,y+135,a[2],16,p.muted);
 if(i===0){s+=rect(x+24,y+169,517,52,12,p.weightText)+txt(x+282,y+201,a[3],16,p.paper,500,'text-anchor="middle"');}
 else if(i===2){s+=rect(x+24,y+169,517,52,11,p.paper,p.danger)+txt(x+45,y+202,a[3],18,p.ink,400);}
 else if(i===3){s+=rect(x+24,y+169,517,52,12,p.control)+txt(x+282,y+201,a[3],16,p.muted,500,'text-anchor="middle"');}
 else{s+=txt(x+24,y+204,a[3],16,i===4?p.danger:(i===5?p.ink:p.brand),500);}
 s+=txt(x+24,y+269,'触控 ≥44 pt · 文字与状态同时表达',14,p.muted);});
 s+=line(548,1290,1715,1290)+txt(574,1336,'图表语义',23,p.ink,500)+line(580,1380,696,1357,p.weight,3)+circle(580,1380,4,p.weight)+circle(696,1357,4,p.weight)+txt(717,1372,'实线与点：实际记录；缺失区间断开，绝不补 0。',18,p.ink)+line(580,1430,696,1420,p.weightText,1.5,'stroke-dasharray="6 5"')+txt(717,1430,'虚线：按日期拟合；标注观察窗口和样本数。',18,p.ink)+line(580,1481,696,1481,p.muted,1,'stroke-dasharray="2 4"')+txt(717,1481,'中性目标：超出坐标范围时放在文字区。',18,p.ink)+txt(574,1548,'体重升降使用同一类别色；摄入不足不展示完成勋章或庆祝。',17,p.muted);
 s+=txt(52,1665,'静态规范 · 已计算主要文字配色对比度；尚未验证原生键盘、VoiceOver、动态字体和小屏。',17,p.muted);return svgRoot(1800,1730,s);
}
function luminance(hex){const a=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];}
async function main(){
 for(const name of ['today','diary','progress','partner','me','settings']){const file=path.join(process.env.LEANON_DESIGN_EVIDENCE||'/tmp/leanon-ui-review-20261005/after',`final-${name}-ios.png`);const crop=await sharp(file).extract({left:48,top:2365,width:1110,height:237}).png().toBuffer();const mask=Buffer.from(`<svg width="1110" height="237"><rect width="1110" height="237" rx="118" fill="white"/></svg>`);const clean=await sharp(crop).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();bars[name]='data:image/png;base64,'+clean.toString('base64');}
 const screens={today:today(),progress:progress(),partner:partner(),diary:diary(),me:me(),settings:settings(),'today-dark':today(true),'weight-form':weightForm(),'food-form':foodForm(),'exercise-form':exerciseForm()};
 for(const [name,svg] of Object.entries(screens))await write(name,svg,3);
 await write('01-brand-components',brandBoard());
 const first=[['today','TODAY / 先行动，再看数据','饮食为焦点，三种记录一眼可见。'],['progress','PROGRESS / 趋势，留出呼吸','体重主图，饮食与活动作背景解释。'],['partner','PARTNER / 把关系还给人','诚实空态，成对图形承接品牌。']];
 await write('02-first-checkpoint',screensBoard(first,'同一品牌，更轻的三种构图','统一语言不等于同一种大卡片。设计提案 · 非原生截图','02 / FIRST CHECKPOINT · v3'));
 await write('03-six-screens',screensBoard([...first,['diary','DIARY / 饮食的记录空间','每日汇总为当前存储事实，不虚构逐餐历史。'],['me','ME / 本机身份与工具','功能状态随平台显示；不虚构登录或资料编辑。'],['settings','SETTINGS / 简单的规则','语言可选择；连接和存储状态说清楚。']],'六屏，更舒适的日常秩序','主任务、关系、个人工具各有秩序；底栏仍是已认可的基准。','03 / SIX SCREENS · v3',2));
 await write('04-forms',screensBoard([['weight-form','WEIGHT / 输入就是主角','数字键盘、单位和校验紧邻输入。'],['food-form','FOOD / 搜索 → 份量 → 确认','结果与动态营养清楚区分。'],['exercise-form','EXERCISE / 编辑一条记录','类型、时长、估算以及保存连续。']],'记录时，把注意力留给输入','原生可编辑输入与已有持久化机制保留；表单内不显示底栏。','04 / FORMS · v3'));
 await write('05-states-dark',statesBoard());
 const contrast=[];for(const [theme,tokens] of [['light',C],['dark',D]]){for(const [fg,bg] of [['ink','canvas'],['ink','paper'],['muted','canvas'],['muted','paper'],['muted','control'],['ink','control'],['brand','canvas'],['brand','brandTint'],...['food','exercise','weight','water','partner'].map(a=>[a+'Text',a+'Tint']),...(theme==='light'?['food','exercise','weight'].map(a=>['paper',a+'Text']):['food','exercise','weight'].map(a=>[a+'Text','paper']))]){let aa=luminance(tokens[fg]),bb=luminance(tokens[bg]);contrast.push({theme,foreground:fg,background:bg,ratio:Number(((Math.max(aa,bb)+.05)/(Math.min(aa,bb)+.05)).toFixed(2)),normalTextAA:(Math.max(aa,bb)+.05)/(Math.min(aa,bb)+.05)>=4.5});}}
 fs.writeFileSync(path.join(out,'tokens.json'),JSON.stringify({status:'proposal-not-implemented',light:C,dark:D,spacing:[4,8,12,16,20,24,32,40,48],revision:3,radii:{hero:22,content:20,control:12,input:11},type:{display:52,title:27,section:20,body:16,auxiliary:14,secondaryNumber:32},semanticRules:{brand:'identity and navigation',food:'food only',exercise:'movement only',weight:'weight only',water:'hydration only',partner:'relationship only',macros:'neutral text within food category',reminder:'neutral utility'},minimumTouchPt:44,motionMs:{press:120,sheet:200,chart:300},contrast},null,2));
 console.log(JSON.stringify({rendered:Object.keys(screens),boards:5,contrast},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
