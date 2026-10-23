import './style.css';
import { SceneManager } from './scene/SceneManager.js';

if(import.meta.env.DEV&&new URLSearchParams(location.search).get('xr-emulate')==='1'){
  const {installDevelopmentEmulator}=await import('./xr/DevelopmentEmulator.js');installDevelopmentEmulator();
}
const host = document.querySelector('#scene');
const app = new SceneManager(host);
if(import.meta.env.DEV&&window.__xrQA)window.__xrQA.app=app;
app.init().then(() => {
  document.querySelector('#loading').classList.add('done');
  setTimeout(() => document.querySelector('#loading')?.remove(), 1600);
}).catch((error) => {
  console.error('Courtyard initialization failed:', error);
  document.querySelector('#loading').remove();
  const panel = document.querySelector('#error');
  panel.hidden = false;
  panel.textContent = '庭院未能载入。请使用开启硬件加速的 Chrome 或 Edge 浏览器后刷新。';
});

window.addEventListener('pagehide', event => { if(!event.persisted)app.dispose(); });
window.addEventListener('pageshow', event => { if(event.persisted){app.active=true;app.previous=0;} });
