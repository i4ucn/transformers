const { chromium } = require('playwright');
const fs=require('fs');
const pathUtil=require('path');
const root=pathUtil.resolve(__dirname, '..');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl'],executablePath:process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[]; page.on('pageerror',e=>errors.push(e.stack));
await page.route('**/*',route=>{
const url=new URL(route.request().url()); if(url.hostname!=='preview.local')return route.abort();
const path=url.pathname==='/'?'/index.html':url.pathname;
let body=fs.readFileSync(path==='/index.html'&&process.env.BASELINE?pathUtil.join(__dirname, 'before-proportions.html'):root+path);
if(path==='/index.html')body=body.toString().replace('requestAnimationFrame(tick);\n})();','window.__qa={camera,controls,state,step,rig,parts,modelRoot,meshBox,robotForms};\n})();');
return route.fulfill({body,contentType:path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});
});
await page.goto('http://preview.local/');
async function shot(name,t,cam){
const report=await page.evaluate(({t,cam})=>{const q=window.__qa;q.state.T=t;q.state.target=t;q.step(0);q.controls.enableDamping=false;q.controls.target.set(0,cam[3],0);q.camera.position.set(...cam.slice(0,3));q.controls.update();q.step(0);const b=q.meshBox(q.modelRoot,new THREE.Box3());return {height:b.max.y-b.min.y,width:b.max.x-b.min.x};},{t,cam});
await page.screenshot({path:'/tmp/'+name+'.png'});console.log(name,report);
}
const prefix=process.env.BASELINE?'before':'after';
await shot(prefix+'-robot-front',1,[0,2.7,13.4,2.7]);
await shot(prefix+'-robot-angle',1,[7.5,5,11.5,2.6]);
if(!process.env.BASELINE){
await shot('after-car-rear',0,[0,1.8,-8,.8]);
await shot('after-car-front',0,[7,4,8.6,.85]);
console.log('finite transforms',await page.evaluate(()=>{const q=window.__qa;for(const t of [0,.14,.42,.64,.70,.75,.82,.9,1,.82,.64,0]){q.state.T=q.state.target=t;q.step(0);if(q.parts.some(p=>!p.g.matrixWorld.elements.every(Number.isFinite)))return false;}return true;}));
}
console.log('round trip geometry',await page.evaluate(()=>{const q=window.__qa;q.state.T=q.state.target=0;q.step(0);return q.robotForms.every(f=>f.source.every((v,i)=>v===f.mesh.geometry.attributes.position.array[i]));}));
if(!process.env.BASELINE){
for(const pose of ['wave','flex','fight']){
await page.evaluate(pose=>{const q=window.__qa; q.state.T=q.state.target=1;q.state.pose=pose; for(const k in q.state.w)q.state.w[k]=k===pose?1:0;q.state.time=1;q.step(0);q.controls.target.set(0,2.6,0);q.camera.position.set(7.5,5,11.5);q.controls.update();q.step(0);},pose);
await page.screenshot({path:'/tmp/after-robot-'+pose+'.png'});
}
}

await page.evaluate(()=>{const q=window.__qa; q.state.T=q.state.target=1;q.state.pose=null;for(const k in q.state.w)q.state.w[k]=0;q.step(0);const b=q.meshBox(q.rig.head.g,new THREE.Box3());const c=b.getCenter(new THREE.Vector3());q.controls.minDistance=.5;q.controls.target.copy(c);q.camera.position.copy(c).add(new THREE.Vector3(.8,.25,1.8));q.controls.update();q.step(0);});
await page.addStyleTag({content:'.plate,.dock,.rail{display:none!important}'});
await page.screenshot({path:'/tmp/robot-head-detail.png'});
await page.evaluate(()=>{const q=window.__qa; const b=q.meshBox(q.rig['foot1'].g,new THREE.Box3());b.union(q.meshBox(q.rig['foot-1'].g,new THREE.Box3()));const c=b.getCenter(new THREE.Vector3());q.controls.target.copy(c);q.camera.position.copy(c).add(new THREE.Vector3(1.2,1.0,2.5));q.controls.update();q.step(0);});
await page.screenshot({path:'/tmp/robot-feet-detail.png'});
console.log('head stowed bounds',await page.evaluate(()=>{const q=window.__qa;q.state.T=q.state.target=0;q.step(0);const inverse=q.rig.head.g.matrixWorld.clone().invert();const box=new THREE.Box3();q.rig.head.g.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld.clone().premultiply(inverse)));}});return {min:box.min.toArray(),max:box.max.toArray()};}));
console.log(JSON.stringify({errors}));
}finally{await browser.close();}
})();
