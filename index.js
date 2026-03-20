require('date-utils');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { setTimeout } = require('timers/promises');
const tabletojson = require('tabletojson').Tabletojson;
const cheerio = require('cheerio');

//line
const axios = require('axios');
const querystring = require('querystring');
const lineNotifyToken = JSON.parse(fs.readFileSync("./settings.json", "utf8")).lineNotifyToken;

const kakoyoyakuList = [];

(async () => {
  while(true){
    const browser = await puppeteer.launch({
      defaultViewport: null,
      args: ['--no-sandbox']
      ,headless: false
    });
    try{
      const page = await browser.newPage();
      // ダイアログにはすべてok
      page.on('dialog',async dialog => {
        dialog.accept();
      })

      // ここからページ操作
      await page.goto('http://reserve.city.ichikawa.lg.jp/');
      await page.waitForFunction(()=> document.readyState === "complete");
    
      /* ログインさせない
      await page.click('input[name="rbtnLogin"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      await setTimeout(5000);
      
      await page.type('input[id="txtID"]',JSON.parse(fs.readFileSync("./settings.json", "utf8")).userid);
      await page.waitForFunction(()=> document.readyState === "complete");  

      await page.type('input[id="txtPass"]',JSON.parse(fs.readFileSync("./settings.json", "utf8")).password);
      await page.waitForFunction(()=> document.readyState === "complete");  
    
      await page.click('input[value="ログイン >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      */
      
      await page.click('input[value="スポーツ施設"]');
      await page.waitForFunction(()=> document.readyState === "complete");
    
      await page.click('input[value="国府台テニスコート"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //浦安に近いので除外
      await page.click('input[value="塩浜市民体育館テニスコート"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //駐車場がないので除外
      //await page.click('input[value="行徳・塩焼中央公園テニスコート"]');
      //await page.waitForFunction(()=> document.readyState === "complete");

      await page.click('input[value="Ｊ：ＣＯＭ北市川スポーツパーク"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //浦安に近いので除外
      //await page.click('input[value="福栄スポーツ広場テニスコート"]');
      //await page.waitForFunction(()=> document.readyState === "complete");

      //廃止されているので除外
      //await page.click('input[value="クリーンセンターテニスコート"]');
      //await page.waitForFunction(()=> document.readyState === "complete");

      await page.click('input[value="菅野終末処理場テニスコート"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      
      await page.click('input[value="次へ >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      await page.click('input[value="1ヶ月"]');
      //await page.click('input[value="1日"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //await page.click('input[value="月"]');//テスト用
      //await page.waitForFunction(()=> document.readyState === "complete");

      //AI生成コード
      //const weekdays = ['月', '火', '水', '木', '金', '土', '日', '祝'];      //全曜日選択
      const weekdays = ['月', '土', '日', '祝'];      //全曜日選択
      //const weekdays = ['土', '日', '祝'];
      for (const day of weekdays) {
        await page.click(`input[value="${day}"]`);
        await page.waitForFunction(() => document.readyState === "complete");
      }

      await page.click('input[value="次へ >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      
      await setTimeout(5000);

      /*
      //次の日以降を見る
      await page.$eval('input[name="ucTermSetting$txtDateFrom"]',element => element.value = '')
      itinitigo = new Date((new Date()).setDate((new Date()).getDate() + 1))//今日に一日を加算した日を作成
      await page.type('input[name="ucTermSetting$txtDateFrom"]',itinitigo.toFormat('YYYY/MM/DD'));
      await page.click('input[value="更新"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      */

      const calenderMaruOrSankaku = await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`);
      if (calenderMaruOrSankaku.length === 0) {
        console.log(`${new Date().toISOString()}: 日毎の情報に △ も ○ も見つからなかったので次の周回へ進みます`);
        await browser.close();
        await setTimeout(60000);
        continue;
      }

      await (await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`))[0].click();
      for (const link of await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`)) {
        await link.click();
      }
      await page.waitForFunction(()=> document.readyState === "complete");  

      await page.click('input[type="submit"][value="次へ >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      
      await setTimeout(5000);

      const timeseriesMaruOrSankaku = await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`);
      if (timeseriesMaruOrSankaku.length === 0) {
        console.log(`${new Date().toISOString()}: 時間毎の情報に △ も ○ も見つからなかったので次の周回へ進みます`);
        await browser.close();
        await setTimeout(60000);
        continue;
      }
      await (await page.$x(`//a[contains(text(),"○")]`))[0].click();
      await page.waitForFunction(()=> document.readyState === "complete");  

      await page.click('input[type="submit"][value="次へ >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      
      const courtname = (await page.$eval('span[id="dlRepeat_ctl00_tpItem_lblShisetsu"]',el => el.innerText)).toString();
      const yoyakudate = (await page.$eval('span[id="dlRepeat_ctl00_tpItem_lblDay"]',el => el.innerText)).toString();
      const yoyakutime = (await page.$eval('span[id="dlRepeat_ctl00_tpItem_lblTime"]',el => el.innerText)).toString();
      console.log(`${new Date().toISOString()}: courtname => " + courtname`)
      console.log(`${new Date().toISOString()}: yoyakudate => " + yoyakudate`)
      console.log(`${new Date().toISOString()}: yoyakutime => " + yoyakutime`)

      //過去予約チェック
      if(kakoyoyakuList.includes(courtname + yoyakudate + yoyakutime)){
	console.log(courtname + yoyakudate + yoyakutime + " は過去に予約したことがあるため予約しませんでした。")
        await browser.close();
        await setTimeout(60000);
        continue
      }

      //予約確定操作
      await page.click('input[type="submit"][value="申込 >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //予約完了チェック
      if(!page.url().match(/YoyakuKanryou.aspx/)){
        console.log(`${new Date().toISOString()}: 何らかの理由で予約に失敗しました。`)
        await browser.close();
        await setTimeout(60000);
        continue
      }

      //通知
      kakoyoyakuList.push(courtname + yoyakudate + yoyakutime)
      console.log(courtname + yoyakudate + yoyakutime)
      const myLine = new Line();
      myLine.setToken(lineNotifyToken);
      myLine.notify(courtname + " の " + yoyakudate + " " + yoyakutime + " を取りました。" + "\n"
	      + "id:" + JSON.parse(fs.readFileSync("./settings.json", "utf8")).userid + "\n"
	      + "pass:" + JSON.parse(fs.readFileSync("./settings.json", "utf8")).password + "\n"
	      + "url:" + "http://reserve.city.ichikawa.lg.jp/"
      );

      //終了処理
      await browser.close();
      await setTimeout(60000);
    } catch(error) {
      console.log(`${new Date().toISOString()}: catched" + error`)
      console.error(error)
      await browser.close();
      await setTimeout(10000);
    }
  }
})();

const Line = function () {};

/**
 * LINE Notifyのトークンセット
 * @param {String} token LINE Notifyトークン
 */
Line.prototype.setToken = function(token) {
  this.token = token;
}

/**
 * LINE Notify実行
 * @param {String} text メッセージ
 */
Line.prototype.notify = function(text) {
  if(this.token == undefined || this.token == null){
    console.error('undefined token.');
    return;
  }
  console.log(`${new Date().toISOString()}: notify message : ${text}`);
  axios(
    {
      method: 'post',
      url: 'https://notify-api.line.me/api/notify',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: querystring.stringify({
        message: text,
      }),
    }
  )
  .then( function(res) {
    console.log(res.data);
  })
  .catch( function(err) {
    console.error(err);
  });
};
