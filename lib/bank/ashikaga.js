const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const url = require('url');
const phantom = require('phantom');

class ashikaga {
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
  
  async login () {
    let URL, postData, headers, func, funcs;
    this.PJS = await phantom.create(['--ignore-ssl-errors=yes']);
    this.page = await this.PJS.createPage();
    await new Promise(resolve => {setTimeout(resolve, 3000)});
    URL = "https://www.parasol.anser.ne.jp/ib/index.do?PT=BS&CCT0080=0129";
    await this.page.open(URL);
    funcs = ["document.getElementsByName('BTX0010')[0].value='"+this.id+"';",
             "document.getElementsByName('BPW0020')[0].value='"+this.password+"';",
             "document.forms[0].submit();"];
    await this.evaluate(2000, funcs);
    const question = await this.page.evaluate(function(){return document.body.innerHTML;});
    let ans = null;
    for (let ai of this.options.aikotoba) {
      let q = new RegExp(ai.question);
      if (question.match(q)) {
        ans = ai.answer;
        break;
      }
    }
    if (ans) {
      funcs = ["document.getElementsByName('BPW0010')[0].value='"+ans+"';",
               "document.forms[0].submit();"];
      await this.evaluate(2000, funcs);
    }
    const body = await this.page.evaluate(function(){return document.body.innerHTML;});
    if (body.match(/再ログイン/g)) {
      funcs = ["var event = document.createEvent('MouseEvents');",
               "event.initEvent('click', false, true);",
               "document.getElementById('btn003').dispatchEvent(event);"];
      await this.evaluate(8000, funcs);
    }
  }

  async getDetails(year, month){
    let body, funcs, $;
    const output = [];
    const lastDay = new Date();
    funcs = ["var event = document.createEvent('MouseEvents');",
             "event.initEvent('click', false, true);",
             "document.getElementById('btn008-1').dispatchEvent(event);"];
    await this.evaluate(5000, funcs);
    funcs = ["var event = document.createEvent('MouseEvents');",
             "event.initEvent('click', false, true);",
             "document.getElementsByClassName('button-message-tabA01')[0].firstElementChild.dispatchEvent(event);"];
    await this.evaluate(5000, funcs);
    if (year !== lastDay.getFullYear() || month !== lastDay.getMonth()+1) {
      lastDay.setYear(year);
      lastDay.setMonth(month);
      lastDay.setDate(0);
    }
    funcs = ["document.getElementById('pulldown130').value='"+year+"';",
             "document.getElementById('pulldown002').value='"+('0'+month).slice(-2)+"';",
             "document.getElementById('pulldown003').value='01';",
             "document.getElementById('pulldown140').value='"+year+"';",
             "document.getElementById('pulldown004').value='"+('0'+month).slice(-2)+"';",
             "document.getElementById('pulldown005').value='"+('0'+lastDay.getDate()).slice(-2)+"';",
             "var event = document.createEvent('MouseEvents');",
             "event.initEvent('click', false, true);",
             "document.getElementById('btn010').dispatchEvent(event);"];
    await this.evaluate(5000, funcs);
    body = await this.page.evaluate(function(){return document.body.innerHTML;});
    $ = cheerio.load(body);
    $('#tblDtl001 tbody').children().slice(1).each(function(){
      let columns = $(this).children();
      let date = columns.eq(1).text().replace(/年|月/g, "/").replace(/\s|　|日分/g, "");
      let price
      if (columns.eq(2).text().replace(/\s|　/g, "") !== "") {
        price = -1 * parseInt(columns.eq(2).text().replace(/円|,|\s|　/g, ""), 10);
      } else {
        price = parseInt(columns.eq(3).text().replace(/円|,|\s|　/g, ""), 10);
      }
      let detail = columns.eq(6).text().replace(/^[\s　]+|[\s　]+$/g, "") + " " + columns.eq(7).text().replace(/^[\s　]+|[\s　]+$/g, "");
      output.push({
        date: date,
        price: price,
        detail: detail
      });
    });
    return output;
  }
}

module.exports  = ashikaga;
