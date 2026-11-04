import en from "../../locales/en.json";

/**
 * The sign in page in front of protected routes. It runs on the Termix
 * address with no app shell, so it copies the look of core's Auth screen and
 * talks to the same login routes. Keep it in step with core's Auth.tsx.
 */

// Same names as locales/translated. i18nextLng holds the short code.
const LANGUAGE_FILES =
  "af_ZA ar_SA bn_BD bg_BG ca_ES zh_CN zh_TW hr_HR cs_CZ da_DK nl_NL et_EE fi_FI fr_FR de_DE el_GR he_IL hi_IN hu_HU id_ID it_IT ja_JP ko_KR lv_LV lt_LT ms_MY no_NO pl_PL pt_PT pt_BR ro_RO ru_RU sr_SP sk_SK sl_SI es_ES sv_SE th_TH tr_TR uk_UA vi_VN";

const STYLES = `
:root{--accent-brand:#f59145;--background:oklch(1 0 0);--foreground:oklch(.1802 .0043 128.73);--card:oklch(1 0 0);--muted:oklch(.97 0 0);--muted-foreground:oklch(.44 0 0);--destructive:oklch(.577 .245 27.325);--border:oklch(.922 0 0);--input:oklch(.922 0 0);--ring:oklch(.708 0 0);--sidebar:oklch(.985 0 0)}
.dark{--background:oklch(.155 .004 128.73);--foreground:oklch(.985 0 0);--card:oklch(.21 .004 128.68);--muted:oklch(.255 0 0);--muted-foreground:oklch(.72 0 0);--destructive:oklch(.704 .191 22.216);--border:oklch(1 0 0/12%);--input:oklch(1 0 0/15%);--ring:oklch(.556 0 0);--sidebar:oklch(.195 .004 128.68)}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
html{font-size:14px}
html.fs-xs{font-size:12px}
html.fs-sm{font-size:13px}
html.fs-lg{font-size:17px}
html.fs-xl{font-size:20px}
body{background:var(--background);color:var(--foreground);font-family:var(--font-ui,"JetBrains Mono Variable","JetBrains Mono"),ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:1rem;line-height:1.5}
button,input{font:inherit;color:inherit}
h1,h2,p{margin:0}
[hidden]{display:none!important}
.shell{position:fixed;inset:0;display:flex;overflow:hidden}
.brand-panel{position:relative;display:none;flex-direction:column;justify-content:space-between;width:46%;max-width:560px;flex-shrink:0;overflow:hidden;border-right:1px solid var(--border);background:var(--sidebar);padding:2.5rem;user-select:none}
.brand-panel::before{content:"";position:absolute;inset:0;opacity:.7;background-image:radial-gradient(circle,color-mix(in oklch,var(--border) 80%,transparent) 1px,transparent 1px);background-size:22px 22px}
.brand-panel::after{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:color-mix(in oklch,var(--accent-brand) 60%,transparent)}
.brand-line,.brand-tag{position:relative}
.brand-line{display:flex;align-items:center;gap:0.75rem}
.brand-line img{width:2rem;height:2rem;object-fit:contain}
.brand-name{font-size:1.125rem;font-weight:700;text-transform:uppercase;letter-spacing:.35em}
.brand-tag{max-width:380px}
.brand-tag h2{font-size:1.5rem;font-weight:600;line-height:1.25;letter-spacing:-.025em}
.brand-tag div{margin-top:1rem;width:2.5rem;height:1px;background:var(--accent-brand)}
.brand-end{position:relative;height:0.75rem}
.side{position:relative;flex:1;display:flex;align-items:center;justify-content:center;padding:1.5rem;overflow-y:auto}
.card{width:100%;max-width:380px;display:flex;flex-direction:column;gap:1.5rem;border:1px solid var(--border);background:var(--card);padding:1.25rem}
.compact{display:flex;align-items:center;gap:0.625rem}
.compact img{width:1.75rem;height:1.75rem;object-fit:contain}
.compact span{font-size:0.875rem;font-weight:700;text-transform:uppercase;letter-spacing:.3em}
.stack{display:flex;flex-direction:column;gap:1.25rem}
.form{display:flex;flex-direction:column;gap:1rem}
.heading{display:flex;flex-direction:column;gap:0.25rem}
.heading h1{font-size:1.25rem;font-weight:700;line-height:1.4}
.note{font-size:0.75rem;color:var(--muted-foreground);overflow-wrap:anywhere}
.note strong{color:var(--foreground);font-weight:700}
.tabs{display:flex;border:1px solid var(--border);overflow:hidden}
.tab{flex:1;padding:0.625rem 0;border:0;background:transparent;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted-foreground);cursor:pointer;transition:color .15s,background-color .15s}
.tab:hover{color:var(--foreground);background:var(--muted)}
.tab[aria-selected=true]{background:var(--accent-brand);color:var(--background)}
.field{display:flex;flex-direction:column;gap:0.375rem}
.field>label,.field>span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted-foreground)}
.wrap{position:relative}
.input{display:block;width:100%;height:2rem;padding:0.25rem 0.625rem;border:1px solid var(--input);border-radius:0;background:color-mix(in oklch,var(--input) 30%,transparent);font-size:0.75rem;outline:none;transition:border-color .15s}
.input::placeholder{color:var(--muted-foreground)}
.input:focus-visible{border-color:var(--ring);box-shadow:0 0 0 1px color-mix(in oklch,var(--ring) 50%,transparent)}
.input:disabled{opacity:.5}
.input.lead{padding-left:2rem}
.input.tail{padding-right:2.25rem}
.input.code{height:3rem;text-align:center;font-size:1.5rem;letter-spacing:.1em}
.lead-icon,.eye{position:absolute;top:50%;transform:translateY(-50%);color:var(--muted-foreground);display:flex}
.lead-icon{left:0.625rem;pointer-events:none}
.eye{right:0.625rem;padding:0;border:0;background:transparent;cursor:pointer;transition:color .15s}
.eye:hover{color:var(--foreground)}
svg{width:1rem;height:1rem;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.check{display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;color:var(--muted-foreground);cursor:pointer}
.check input{appearance:none;width:1rem;height:1rem;margin:0;border:1px solid var(--input);background:color-mix(in oklch,var(--input) 30%,transparent);cursor:pointer}
.check input:checked{background:var(--accent-brand);border-color:var(--accent-brand);box-shadow:inset 0 0 0 3px var(--card)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;width:100%;height:2.5rem;padding:0 0.625rem;border:1px solid transparent;border-radius:0;font-size:0.75rem;font-weight:700;text-decoration:none;cursor:pointer;transition:background-color .15s,opacity .15s}
.btn:disabled{opacity:.5;pointer-events:none}
.btn:focus-visible{outline:1px solid var(--ring)}
.btn.primary{background:var(--accent-brand);color:var(--background)}
.btn.primary:hover{background:color-mix(in oklch,var(--accent-brand) 90%,transparent)}
.btn.outline{border-color:var(--input);background:color-mix(in oklch,var(--input) 30%,transparent);color:var(--foreground)}
.btn.outline:hover{background:color-mix(in oklch,var(--input) 50%,transparent)}
.fold{display:flex;flex-direction:column;border:1px solid var(--border)}
.fold-head{display:flex;align-items:center;justify-content:space-between;width:100%;padding:0.625rem 0.75rem;border:0;background:transparent;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted-foreground);cursor:pointer;transition:color .15s,background-color .15s}
.fold-head:hover{color:var(--foreground);background:var(--muted)}
.fold .form{gap:0.75rem;padding:0.75rem;border-top:1px solid var(--border)}
.error{padding:0.5rem 0.625rem;border:1px solid color-mix(in oklch,var(--destructive) 40%,transparent);background:color-mix(in oklch,var(--destructive) 10%,transparent);font-size:0.75rem;color:var(--destructive);overflow-wrap:anywhere}
.rule{height:1px;background:var(--border)}
.foot{text-align:center;font-size:0.75rem;color:var(--muted-foreground)}
.foot a{font-weight:700;color:var(--accent-brand);text-decoration:none;transition:color .15s}
.foot a:hover{color:color-mix(in oklch,var(--accent-brand) 70%,transparent)}
.spin{width:1.25rem;height:1.25rem;border:2px solid var(--accent-brand);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (min-width:1024px){.brand-panel{display:flex}.compact{display:none}}
`;

// Runs before anything paints, so the page never flashes the wrong theme.
const THEME_SCRIPT = `
(function(){
var root=document.documentElement,theme=null,cached=null,size=null;
try{size=localStorage.getItem("termix-font-size");theme=localStorage.getItem("vite-ui-theme");cached=JSON.parse(localStorage.getItem("termix-theme-css")||"null");}catch(e){}
if(!theme)theme="dark";
if(theme==="system")theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
root.classList.add(theme);
if(size)root.classList.add("fs-"+size);
if(cached&&cached.id===theme&&typeof cached.href==="string"){
var link=document.createElement("link");link.rel="stylesheet";link.href=cached.href;document.head.appendChild(link);
}
})();
`;

const CLIENT_SCRIPT = `
(function(){
var boot=window.GATE_BOOT,strings=boot.strings;
var query=new URLSearchParams(location.search);
var root=location.pathname.split("/plugin-api/")[0];
var card=document.getElementById("form-area");
var ICONS={
user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
key:'<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
eye:'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
eyeOff:'<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
finger:'<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
down:'<path d="m6 9 6 6 6-6"/>',
up:'<path d="m18 15-6-6-6 6"/>'
};
var state={
view:"checking",tab:"login",methods:[],passwordOn:true,rememberOn:true,passkeyOn:false,
username:"",password:"",remember:false,code:"",showPassword:false,openFolder:null,
factors:[],factor:null,tempToken:"",busy:false,error:"",title:"",message:"",signedIn:false
};
var timer=null,checks=0;

function t(key,vars){
var text=strings[key]||boot.strings[key]||key;
if(vars)Object.keys(vars).forEach(function(name){text=text.split("{{"+name+"}}").join(vars[name]);});
return text;
}
function h(tag,props,kids){
var el=document.createElement(tag);
Object.keys(props||{}).forEach(function(key){
var value=props[key];
if(key==="class")el.className=value;
else if(key.slice(0,2)==="on")el.addEventListener(key.slice(2),value);
else if(value===true)el.setAttribute(key,"");
else if(value!==false&&value!=null)el.setAttribute(key,value);
});
(kids||[]).forEach(function(kid){if(kid!=null)el.append(kid);});
return el;
}
function icon(name){
var box=document.createElement("span");box.className="lead-box";
box.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+ICONS[name]+"</svg>";
return box.firstChild;
}
function api(path,options){return fetch(root+path,Object.assign({credentials:"include"},options));}
function post(path,body){
return api(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
}
function readJson(response){return response.json().catch(function(){return {};});}
function button(kind,label,iconName,props){
var kids=state.busy?[t("loading")]:[iconName?icon(iconName):null,label];
return h("button",Object.assign({class:"btn "+kind,type:"button",disabled:state.busy},props),kids);
}
function submitButton(label,iconName){return button("primary",label,iconName,{type:"submit"});}
function heading(title,text){
return h("div",{class:"heading"},[h("h1",{},[title]),text?h("p",{class:"note"},[text]):null]);
}
function errorLine(){return state.error?h("p",{class:"error",role:"alert"},[state.error]):null;}
function field(label,id,control){return h("div",{class:"field"},[h("label",{for:id},[label]),control]);}
function plainInput(id,type,value,onInput,placeholder,autocomplete){
return h("input",{class:"input",id:id,type:type,value:value,placeholder:placeholder,autocomplete:autocomplete,disabled:state.busy,oninput:onInput});
}
function userField(id){
var input=plainInput(id,"text",state.username,function(e){state.username=e.target.value;},"username","username");
input.classList.add("lead");
return field(t("username"),id,h("div",{class:"wrap"},[h("span",{class:"lead-icon"},[icon("user")]),input]));
}
function passwordField(id){
var input=plainInput(id,state.showPassword?"text":"password",state.password,function(e){state.password=e.target.value;},"\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022","current-password");
input.classList.add("tail");
var eye=h("button",{class:"eye",type:"button",tabindex:"-1","aria-label":t("showPassword"),onclick:function(){state.showPassword=!state.showPassword;render();}},[icon(state.showPassword?"eyeOff":"eye")]);
return field(t("password"),id,h("div",{class:"wrap"},[input,eye]));
}
function rememberBox(){
if(!state.rememberOn)return null;
return h("label",{class:"check"},[
h("input",{type:"checkbox",checked:state.remember,disabled:state.busy,onchange:function(e){state.remember=e.target.checked;}}),
t("rememberMe")
]);
}
function openLink(){
return h("p",{class:"foot"},[t("otherOptions")+" ",h("a",{href:root+"/",target:"_blank",rel:"noopener"},[t("openTermix")])]);
}

function setBusy(on){state.busy=on;if(on)state.error="";render();}
function fail(text){state.busy=false;state.error=text;render();}
function run(work,fallback){
setBusy(true);
return work().catch(function(error){
// Closing the browser's passkey prompt is not an error.
if(error&&(error.name==="NotAllowedError"||error.name==="AbortError")){state.busy=false;render();return;}
fail((error&&error.message)||t(fallback));
});
}
function send(path,body,fallback){
return post(path,body).then(function(response){
return readJson(response).then(function(data){
if(!response.ok&&!data.requires_totp&&!data.requires_second_factor){
throw new Error(data.error||t(fallback));
}
finishLogin(data);
});
});
}
function finishLogin(data){
if(data.requires_totp||data.requires_second_factor){
state.tempToken=data.temp_token||"";
state.factors=(data.second_factors&&data.second_factors.length)?data.second_factors.map(function(f){return f.id;}):["totp"];
state.factor=state.factors[0];
state.code="";state.busy=false;state.error="";state.view="factor";
render();
return;
}
if(!data.success)throw new Error(t("loginFailed"));
stopPolling();
state.signedIn=true;state.busy=false;state.view="checking";
render();
check();
}

function loginPassword(e){
e.preventDefault();
if(!state.username.trim()||!state.password){state.error=t("required");render();return;}
run(function(){
return send("/users/login",{username:state.username.trim(),password:state.password,rememberMe:state.remember},"loginFailed");
},"loginFailed");
}
function loginFolder(instance){
return function(e){
e.preventDefault();
if(!state.username.trim()||!state.password){state.error=t("required");render();return;}
run(function(){
return send("/users/auth/ldap/verify",{username:state.username.trim(),password:state.password,rememberMe:state.remember,instanceId:instance},"loginFailed");
},"loginFailed");
};
}
function loginRedirect(methodId,instanceId){
// Opened in the click itself, or the browser blocks it. This page keeps
// checking, so it moves on once the provider signs the user in.
var tab=window.open("about:blank","_blank");
run(function(){
var params=new URLSearchParams({instance:instanceId,rememberMe:String(state.remember)});
return api("/users/auth/"+encodeURIComponent(methodId)+"/start?"+params).then(function(response){
return readJson(response).then(function(data){
if(!response.ok||!data.redirectUrl)throw new Error(data.error||t("loginFailed"));
if(tab){tab.opener=null;tab.location=data.redirectUrl;}else location.assign(data.redirectUrl);
state.busy=false;state.error="";render();
});
}).catch(function(error){if(tab)tab.close();throw error;});
},"loginFailed");
}
function webauthnGet(options){
return navigator.credentials.get({publicKey:PublicKeyCredential.parseRequestOptionsFromJSON(options)}).then(function(credential){
return credential.toJSON();
});
}
function loginPasskey(){
run(function(){
var name=state.username.trim();
return post("/plugin-api/webauthn/authenticate/options",name?{username:name}:{}).then(function(response){
return readJson(response).then(function(data){
if(!response.ok)throw new Error(data.error||t("loginFailed"));
return webauthnGet(data.options).then(function(assertion){
return send("/users/auth/passkey/verify",{challengeId:data.challengeId,response:assertion,rememberMe:state.remember},"loginFailed");
});
});
});
},"loginFailed");
}
function factorBody(extra){
var body=Object.assign({rememberMe:state.remember},extra);
if(state.tempToken)body.temp_token=state.tempToken;
return body;
}
function verifyCode(e){
e.preventDefault();
if(!/^[A-Z0-9]{6,8}$/.test(state.code))return;
run(function(){
return send("/users/auth/second-factor/totp/verify",factorBody({totp_code:state.code}),"badCode");
},"badCode");
}
function verifyKey(){
run(function(){
return post("/users/auth/second-factor/security-key/challenge",{temp_token:state.tempToken||undefined}).then(function(response){
return readJson(response).then(function(data){
if(!response.ok)throw new Error(data.error||t("loginFailed"));
return webauthnGet(data.challenge).then(function(assertion){
return send("/users/auth/second-factor/security-key/verify",factorBody({response:assertion}),"loginFailed");
});
});
});
},"loginFailed");
}

function passkeyButton(){
if(!state.passkeyOn)return null;
return button("outline",t("passkey"),"finger",{onclick:loginPasskey});
}
function passwordForm(){
return h("form",{class:"form",onsubmit:loginPassword},[
userField("gate-user"),passwordField("gate-pass"),rememberBox(),
submitButton(t("signIn"),"key"),passkeyButton()
]);
}
function folderForm(method,instance){
var key=method.id+":"+instance.id,open=state.openFolder===key;
return h("div",{class:"fold"},[
h("button",{class:"fold-head",type:"button","aria-expanded":String(open),onclick:function(){
state.openFolder=open?null:key;state.error="";render();
}},[h("span",{},[t("signInWith",{name:instance.label})]),icon(open?"up":"down")]),
open?h("form",{class:"form",onsubmit:loginFolder(instance.id)},[
userField("gate-folder-user"),passwordField("gate-folder-pass"),submitButton(t("signIn"),"key")
]):null
]);
}
function externalPanel(){
var parts=[];
state.methods.forEach(function(method){
(method.instances||[]).forEach(function(instance){
if(method.kind==="redirect"){
parts.push(button("primary",t("signInWith",{name:instance.label}),null,{onclick:function(){loginRedirect(method.id,instance.id);}}));
}else if(method.id==="ldap"){
parts.push(folderForm(method,instance));
}
});
});
if(!state.passwordOn)parts.push(passkeyButton());
return h("div",{class:"form"},[rememberBox()].concat(parts));
}
function hasExternal(){
return state.methods.some(function(method){
return (method.kind==="redirect"||method.id==="ldap")&&(method.instances||[]).length>0;
});
}
function loginView(){
var both=state.passwordOn&&hasExternal();
var tab=both?state.tab:(state.passwordOn?"login":"external");
var kids=[];
if(both){
kids.push(h("div",{class:"tabs",role:"tablist"},[["login",t("signIn")],["external",t("external")]].map(function(item){
return h("button",{class:"tab",type:"button",role:"tab","aria-selected":String(tab===item[0]),onclick:function(){
state.tab=item[0];state.error="";render();
}},[item[1]]);
})));
}
kids.push(heading(t("title"),boot.host?signInNote():null));
kids.push(errorLine());
kids.push(tab==="login"?passwordForm():externalPanel());
kids.push(h("div",{class:"rule"}));
kids.push(openLink());
return h("div",{class:"stack"},kids);
}
function signInNote(){
var parts=t("subtitle",{host:"\\u0000"}).split("\\u0000");
return h("span",{},[parts[0],h("strong",{},[boot.host]),parts[1]||""]);
}
function factorPanel(){
if(state.factor==="totp"){
return h("form",{class:"form",onsubmit:verifyCode},[
h("div",{class:"field"},[h("label",{for:"gate-code"},[t("code")]),
h("input",{class:"input code",id:"gate-code",type:"text",placeholder:"000000",maxlength:"8",value:state.code,autocomplete:"one-time-code",disabled:state.busy,oninput:function(e){
e.target.value=e.target.value.replace(/[^a-zA-Z0-9]/g,"").toUpperCase().slice(0,8);
state.code=e.target.value;
}})]),
h("p",{class:"note"},[t("backupHint")]),
submitButton(t("verify"),null)
]);
}
if(state.factor==="security-key"&&webauthnReady()){
return h("div",{class:"form"},[
h("p",{class:"note"},[t("keyPrompt")]),
button("primary",t("useKey"),"key",{onclick:verifyKey})
]);
}
return h("p",{class:"note"},[t("factorInTermix")]);
}
function factorView(){
var kids=[heading(t("factorTitle"),t("factorNote"))];
if(state.factors.length>1){
kids.push(h("div",{class:"tabs",role:"tablist"},state.factors.map(function(id){
return h("button",{class:"tab",type:"button",role:"tab","aria-selected":String(state.factor===id),onclick:function(){
state.factor=id;state.error="";render();
}},[t(id==="totp"?"factorCode":id==="security-key"?"factorKey":"factorOther")]);
})));
}
kids.push(errorLine());
kids.push(factorPanel());
kids.push(button("outline",t("back"),null,{onclick:function(){
state.view="login";state.password="";state.tempToken="";state.error="";render();
}}));
kids.push(h("div",{class:"rule"}));
kids.push(openLink());
return h("div",{class:"stack"},kids);
}
function messageView(){
return h("div",{class:"stack"},[
heading(state.title,state.message),
h("a",{class:"btn outline",href:root+"/",target:"_blank",rel:"noopener"},[t("openTermix")])
]);
}
function render(){
var active=document.activeElement&&document.activeElement.id;
var view=state.view==="login"?loginView():state.view==="factor"?factorView():state.view==="message"?messageView():null;
document.getElementById("spinner").hidden=view!==null;
document.getElementById("panel").hidden=view===null;
card.textContent="";
if(view)card.append(view);
var next=active&&document.getElementById(active);
if(next)next.focus();
else{
var first=card.querySelector("input:not([type=checkbox])");
if(first&&!first.value)first.focus();
}
}
function showMessage(title,message){
stopPolling();
state.view="message";state.title=title;state.message=message;
render();
}
function stopPolling(){if(timer){clearInterval(timer);timer=null;}}

function webauthnReady(){
return !!(window.PublicKeyCredential&&PublicKeyCredential.parseRequestOptionsFromJSON&&navigator.credentials);
}
function loadStrings(){
var saved=null;
try{saved=localStorage.getItem("i18nextLng");}catch(e){}
if(!saved||saved==="en")return Promise.resolve();
var short=saved.split("-")[0];
var file=boot.languages.filter(function(name){return name===saved.replace("-","_");})[0]||
boot.languages.filter(function(name){return name.split("_")[0]===short;})[0];
if(!file)return Promise.resolve();
return fetch(root+"/plugin-assets/reverse-proxy/locales/translated/"+file+".json").then(function(response){
return response.ok?response.json():null;
}).then(function(data){
if(data&&data.gate)strings=Object.assign({},boot.strings,data.gate);
document.documentElement.lang=short;
}).catch(function(){});
}
function loadBranding(){
return api("/users/branding").then(function(response){return response.ok?response.json():null;}).then(function(brand){
if(!brand)return;
var name=brand.appName||"Termix";
document.title=name;
document.querySelectorAll("[data-brand-name]").forEach(function(el){el.textContent=name;});
if(brand.tagline)document.getElementById("brand-tag").textContent=brand.tagline;
if(brand.logo)document.querySelectorAll("[data-brand-logo]").forEach(function(el){el.src=brand.logo;el.hidden=false;});
}).catch(function(){});
}
function loadMethods(){
var methods=api("/users/auth/methods").then(function(response){return response.ok?response.json():null;}).then(function(data){
if(!data)return;
state.methods=Array.isArray(data.methods)?data.methods:[];
state.rememberOn=data.rememberDevice!==false;
}).catch(function(){});
var password=api("/users/password-login-allowed").then(function(response){return response.ok?response.json():null;}).then(function(data){
if(data&&data.allowed===false)state.passwordOn=false;
}).catch(function(){});
return Promise.all([methods,password]).then(function(){
var hasPasskey=state.methods.some(function(method){return method.id==="passkey";});
if(!hasPasskey||!webauthnReady())return;
return api("/plugin-api/webauthn/login-options").then(function(response){return response.ok?response.json():{};}).catch(function(){return {};}).then(function(data){
state.passkeyOn=data.passwordless!==false;
});
});
}

function check(){
var mine=++checks;
var url=new URL("gate/token",location.href);
url.searchParams.set("route",query.get("route")||"");
url.searchParams.set("to",query.get("to")||"");
return fetch(url,{credentials:"include"}).then(function(response){
// A slow poll from before a login must not overrule the newer check.
if(mine!==checks)return;
if(response.status===401){
if(state.signedIn){
state.signedIn=false;
showMessage(t("stuckTitle"),t("stuckNote"));
return;
}
if(state.view==="checking"&&!state.loaded){
state.loaded=true;
loadMethods().then(function(){state.view="login";render();});
}
if(!timer)timer=setInterval(function(){if(!state.busy)check();},2500);
return;
}
return readJson(response).then(function(data){
if(response.status===200&&data.url){stopPolling();location.replace(data.url);return;}
showMessage(t("noAccess"),data.error||t("noAccessNote"));
});
}).catch(function(){
if(mine===checks&&state.view==="checking")showMessage(t("offlineTitle"),t("offlineNote"));
});
}

Promise.all([loadStrings(),loadBranding()]).then(function(){
document.getElementById("brand-tag").textContent=document.getElementById("brand-tag").textContent||t("tagline");
if(!boot.host){showMessage(t("badLinkTitle"),t("badLinkNote"));return;}
check();
});
})();
`;

function json(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderGatePage(options: {
  nonce: string;
  host: string | null;
}): string {
  const { nonce, host } = options;
  const boot = {
    host,
    strings: en.gate,
    languages: LANGUAGE_FILES.split(" "),
  };
  const logo = `<img data-brand-logo alt="" hidden>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Termix</title>
<style nonce="${nonce}">${STYLES}</style>
<script nonce="${nonce}">${THEME_SCRIPT}</script>
</head><body><div class="shell">
<div class="brand-panel">
<div class="brand-line">${logo}<span class="brand-name" data-brand-name>Termix</span></div>
<div class="brand-tag"><h2 id="brand-tag"></h2><div></div></div>
<div class="brand-end"></div>
</div>
<div class="side">
<div class="spin" id="spinner" role="status"></div>
<div class="card" id="panel" hidden>
<div class="compact">${logo}<span data-brand-name>Termix</span></div>
<div id="form-area"></div>
</div>
</div>
</div>
<script nonce="${nonce}">window.GATE_BOOT=${json(boot)};</script>
<script nonce="${nonce}">${CLIENT_SCRIPT}</script>
</body></html>`;
}

export const GATE_CSP = (nonce: string) =>
  `default-src 'none'; style-src 'self' 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
