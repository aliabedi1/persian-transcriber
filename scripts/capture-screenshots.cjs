const {_electron}=require('playwright');
const path=require('node:path');
const fs=require('node:fs/promises');
(async()=>{
 if(!process.env.AVA_DEMO_AUDIO) throw new Error('Set AVA_DEMO_AUDIO to a public or consented demo recording. Screenshots are published.');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({args:[path.join(__dirname,'..')],env});
 try {
 const page=await app.firstWindow();
 await page.getByRole('combobox',{name:'Interface language / زبان برنامه'}).waitFor();
 await page.evaluate(()=>{localStorage.setItem('ava-ui-language','fa');localStorage.setItem('ava-theme','light')});
 await page.reload();
 await page.getByRole('heading',{name:'تبدیل صدا و ویدیو به متن'}).waitFor();
 await page.waitForFunction(()=>!document.body.innerText.includes('در حال بررسی کارت گرافیک'));
 await fs.mkdir(path.join(__dirname,'../docs/screenshots'),{recursive:true});
 await page.screenshot({path:path.join(__dirname,'../docs/screenshots/persian-light.png'),fullPage:true});
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},process.env.AVA_DEMO_AUDIO);
 await page.getByRole('button',{name:'انتخاب فایل',exact:true}).click();
 await page.getByRole('button',{name:'تبدیل به متن',exact:true}).click();
 await page.getByRole('textbox',{name:'بخش 1',exact:true}).waitFor({timeout:180000});
 await page.getByRole('button',{name:'تغییر به حالت تیره',exact:true}).click();
 await page.waitForFunction(() => document.documentElement.classList.contains('dark') && document.documentElement.style.colorScheme === 'dark');
 await page.evaluate(() => document.fonts.ready);
 await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent === '');
 await page.screenshot({path:path.join(__dirname,'../docs/screenshots/persian-dark-transcript.png'),fullPage:true});
 console.log('Saved light workspace and dark transcript screenshots.');
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
