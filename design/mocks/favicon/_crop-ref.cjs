const path=require('path'),fs=require('fs'),os=require('os');
const puppeteer=require(path.join(os.tmpdir(),'node_modules','puppeteer-core'));
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const src='D:/Documents/HTA/My Projects/personal-website/design/mocks/favicon/_ref/home-1440.png';
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--allow-file-access-from-files','--hide-scrollbars']});
  const p=await b.newPage();
  // crop region in original px
  const regions=[[380,330,560,300],[820,470,600,300]];
  let i=0;
  for(const [x,y,w,h] of regions){
    await p.setViewport({width:Math.round(w*3),height:Math.round(h*3),deviceScaleFactor:1});
    await p.setContent(`<style>html,body{margin:0;padding:0;overflow:hidden}img{position:absolute;left:${-x*3}px;top:${-y*3}px;width:${1620*3}px;image-rendering:pixelated}</style><img src="file:///${src}">`);
    await new Promise(r=>setTimeout(r,400));
    await p.screenshot({path:path.join(os.tmpdir(),`ref-crop-${i}.png`)});
    console.log('wrote',path.join(os.tmpdir(),`ref-crop-${i}.png`));
    i++;
  }
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
