const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const url = require('url');
const phantom = require('phantom');
const {google} = require('googleapis');
const util = require('util');

class smbc {
  constructor ({id, password, options}) {
    this.id = id;
    this.password = password;
    this.options = options || {};
    this.PJS = null;
    this.page = null;
    this.evaluate = async function (timeout, funcs) {
      let func = "function(){"+(funcs.reduce((a,b)=>{return a+b;}))+"}";
      await this.page.evaluate(func);
      await new Promise(resolve => {setTimeout(resolve, timeout)});
    }
  }

  async waitInit () {}

  async waitNewMail (label_id, time, count) {
    await new Promise(resolve => {setTimeout(resolve, 10000)}); //10s x 10 times
    const gmail = google.gmail({version:'v1', auth:this.options.gmail_auth});
    var run = util.promisify(gmail.users.messages.list);
    var ret = await run({userId: "me", labelIds: [label_id]});
    var i = ret.data.messages[0].id;
    run = util.promisify(gmail.users.messages.get);
    ret = await run({userId: "me", id: i});
    if(ret.data.internalDate > time) {
      return new Buffer(ret.data.payload.body.data, 'base64').toString();
    } else {
      if (count < 10) {
        var r = await this.waitNewMail(label_id, time, count+1);
        return r;
      } else {
        return false;
      }
    }
  }

  async login () {
    let URL, funcs, HTML;
    this.PJS = await phantom.create(['--ignore-ssl-errors=yes']);
    this.page = await this.PJS.createPage();
    URL = "https://www.aeon.co.jp/NetBranch/view.do";
    await this.page.open(URL);
    await new Promise(resolve => {setTimeout(resolve, 3000)});
    funcs = ["document.getElementsByName('netMemberId')[0].value='"+this.id+"';",
             "document.getElementsByName('password')[0].value='"+this.password+"';",
             "document.forms[0].submit();"]
    await this.evaluate(5000, funcs);
    HTML = await this.page.evaluate(function(){return document.body.innerHTML;});
    if (HTML.match(/ワンタイム/g)) {
      let date = new Date().getTime();
      funcs = ["document.forms[0].submit();"];
      await this.evaluate(5000, funcs);
      HTML = await this.page.evaluate(function(){return document.body.innerHTML;});
      const gmail = google.gmail({version:'v1', auth:this.options.gmail_auth});
      var run = util.promisify(gmail.users.labels.list);
      var ret = await run({userId: "me"});
      var index = ret.data.labels.findIndex(i => i.name === "aeon-onetime");
      var id = ret.data.labels[index].id;
      ret = await this.waitNewMail(id, date, 0);
      if (ret) {
        var code = ret.match(/\d{6}/g)[0];
        funcs = ["document.getElementsByName('otpwd')[0].value='"+code+"';",
                 "document.getElementsByName('registName')[0].value='"+"スクレイピング"+"';"]
        await this.evaluate(5000, funcs);
        HTML = await this.page.evaluate(function(){return document.body.innerHTML;});
        if (HTML.match(/認証が完了しました/g)) {
          funcs = ["document.forms[0].submit();"];
          await this.evaluate(5000, funcs);
        } else {
          console.log("ERROR");
        }
      }
    }
  }

  async getDetails(year, month){
    let $, HTML, funcs;
    const output = [];
    const checkPages = [];
    funcs = ["var event = document.createEvent('MouseEvents');",
             "event.initEvent('click', false, true);",
             "document.getElementsByClassName('Sharedpart_icon Sharedpart_detail')[0].dispatchEvent(event);"];
    await this.evaluate(5000, funcs);
    HTML = await this.page.evaluate(function(){return document.body.innerHTML;});
    $ = cheerio.load(HTML);
    const latestY = parseInt($('.data-body').eq(1).text().match(/(\d+)年(\d+)月/)[1]);
    const latestM = parseInt($('.data-body').eq(1).text().match(/(\d+)年(\d+)月/)[2]);
    const diff = (year - latestY) * 12 + (month - latestM);
    if (-4 < diff) {
      if (-3 < diff) {
        checkPages.push(1);
        if (diff < 0) {
          checkPages.push(0);
        }
        if (diff < -1) {
          checkPages.push(-1);
        }
      } else {
        if (diff === -3) {
          checkPages.push(-2);
        }
      }
    } else {
      throw {message: "No Data"};
    }
    for (let i = -2; i <= 0; i++) {
      if (checkPages.indexOf(i) >= 0) {
        funcs = ["var event = document.createEvent('MouseEvents');",
                 "event.initEvent('click', false, true);",
                 "document.getElementsByClassName('tab-static tab-history')[0].children["+(-1*i+1)+"].dispatchEvent(event);"];
        await this.evaluate(5000, funcs);
        HTML = await this.page.evaluate(function(){return document.body.innerHTML;});
        $ = cheerio.load(HTML);
        $('.details-table-additional-wrap table').eq(0).children().slice(1).each(function(){
          let columns = $(this).children().eq(0).children();
          let date = columns.eq(0).find('p').eq(0).text()
          if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
              === month) {
            output.push({
              date: date,
              price: -1 * parseInt(columns.eq(1).text().replace(/円|,|\s/g, ""), 10),
              detail: columns.eq(0).find('p').eq(1).text()
            });
          }
        });
      }
    }
    if (checkPages.indexOf(1) >= 0) {
      funcs = ["var event = document.createEvent('MouseEvents');",
               "event.initEvent('click', false, true);",
               "document.getElementsByClassName('tab-static tab-history')[0].children[0].dispatchEvent(event);"];
      await this.evaluate(5000, funcs);
      HTML = await this.page.evaluate(function(){return document.body.innerHTML;});
      $ = cheerio.load(HTML);
      $('.details-table-additional-wrap .details-table').each(function(){
        $(this).children().slice(1).each(function(){
          let columns = $(this).children().eq(0).children();
          let date = columns.eq(1).find('p').eq(0).text()
          if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
              === month) {
            output.push({
              date: date,
              price: -1 * parseInt(columns.eq(2).text().replace(/円|,|\s/g, ""), 10),
              detail: columns.eq(1).find('p').eq(1).text()
            });
          }
        });
      });
    }
    output.sort((a, b)=>{return a.date < b.date ? -1 : 1;});
    return output;
  }
}

module.exports  = smbc;
