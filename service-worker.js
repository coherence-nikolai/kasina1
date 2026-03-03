var CACHE="collapse-v1.0.0";
var FILES=["./","index.html","app.js?v=1.0.0","data.js?v=1.0.0"];

self.addEventListener("install",function(e){
e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(FILES);}));
});

self.addEventListener("activate",function(e){
e.waitUntil(
caches.keys().then(function(keys){
return Promise.all(keys.map(function(k){
if(k!==CACHE) return caches.delete(k);
}));
})
);
});

self.addEventListener("fetch",function(e){
e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request);}));
});
