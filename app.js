var LANG=localStorage.getItem("lang")||(navigator.language||"en").indexOf("es")===0?"es":"en";

var field=document.getElementById("field");
var traitsEl=document.getElementById("traits");
var cueEl=document.getElementById("cue");
var explainEl=document.getElementById("explain");
var langEl=document.getElementById("lang");

langEl.onclick=function(){
LANG=LANG==="en"?"es":"en";
localStorage.setItem("lang",LANG);
renderTraits();
};

var particles=[];
var history=[];
var current=null;
var usage={};
var seenExplain=localStorage.getItem("seenExplain");

function Particle(){
this.el=document.createElement("div");
this.el.className="particle";
this.x=Math.random()*window.innerWidth;
this.y=Math.random()*window.innerHeight;
this.dx=(Math.random()-.5)*.2;
this.dy=(Math.random()-.5)*.2;
this.blur=3;
this.opacity=.6;
field.appendChild(this.el);
}

Particle.prototype.update=function(){
this.x+=this.dx;
this.y+=this.dy;
this.el.style.transform="translate("+this.x+"px,"+this.y+"px)";
this.el.style.opacity=this.opacity;
this.el.style.filter="blur("+this.blur+"px)";
};

function init(){
for(var i=0;i<9;i++) particles.push(new Particle());
animate();
setTimeout(collapse,1200);
}

function animate(){
for(var i=0;i<particles.length;i++){
particles[i].update();
}
requestAnimationFrame(animate);
}

function collapse(){
if(current){
current.blur=0;
current.opacity=.7;
history.push(current);
}
var available=particles.filter(function(p){return p!==current;});
current=available[Math.floor(Math.random()*available.length)];
current.blur=0;
current.opacity=1;
current.dx=0;
current.dy=0;

setTimeout(function(){
renderTraits();
if(!seenExplain){
showExplain();
localStorage.setItem("seenExplain",1);
seenExplain=true;
}
},1800);
}

function renderTraits(){
traitsEl.innerHTML="";
var t=CONTENT[LANG].traits;
for(var key in t){
(function(k){
var span=document.createElement("span");
span.className="trait";
span.textContent=t[k];
span.onclick=function(){selectTrait(k,span);};
traitsEl.appendChild(span);
})(key);
}
traitsEl.classList.add("visible");
}

function selectTrait(key,el){
var nodes=document.querySelectorAll(".trait");
for(var i=0;i<nodes.length;i++){
if(nodes[i]!==el) nodes[i].classList.add("dim");
}

applyTrait(key);
showCue(key);
}

function applyTrait(key){
var hueMap={
calm:-10,
courageous:8,
clear:-5,
present:0,
expansive:12,
centered:-15,
luminous:20
};
var h=40+hueMap[key];
current.el.style.boxShadow="0 0 24px hsla("+h+",70%,70%,.35)";
}

function showCue(key){
usage[key]=(usage[key]||0)+1;
var cues=CONTENT[LANG].cues[key];
if(usage[key]<=2) cueEl.textContent=cues[0];
else if(usage[key]<=5) cueEl.textContent=cues[1];
else return;

cueEl.classList.add("visible");
setTimeout(function(){ cueEl.style.opacity=.6; },6000);
}

function showExplain(){
explainEl.textContent=CONTENT[LANG].explain;
explainEl.classList.add("visible");
explainEl.onclick=function(){ explainEl.classList.remove("visible"); };
}

init();
