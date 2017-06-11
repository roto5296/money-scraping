const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const url = require('url');
const phantom = require('phantom');

class smbc {
  constructor ({id, password, options}) {
    this.id = id;
    this.password = password;
    this.options = options || {};
    this.PJS = null;
  }

  async login () {
    let URL, postData, headers, func;
    this.PJS = await phantom.create();
    const loginPage = await this.PJS.createPage();
    URL = "https://www.smbc-card.com/mem/index.jsp";
    await loginPage.open(URL);
    const func1 = "document.getElementsByName('userid')[0].value='"+this.id+"';"
    const func2 = "document.getElementsByName('password')[0].value='"+this.password+"';"
    const func3 = "document.forms[1].submit();"
    func = "function(){"+func1+func2+func3+"}";
    await loginPage.evaluate(func);
    await new Promise(resolve => {setTimeout(resolve, 3000)});
    await loginPage.close();
  }

  async getDetails(year, month){
    let HTMLs, $, URLs;
    const output = [];
    const NY = month === 12 ? year + 1 : year;
    const NM = month === 12 ? 1 : month + 1;
    const NNY = NM === 12 ? NY + 1 : NY;
    const NNM = NM === 12 ? 1 : NM + 1;
    URLs = [
      "https://www.smbc-card.com/memx/web_meisai/top/index.html?p01="
        +NY+('0'+NM).slice(-2),
      "https://www.smbc-card.com/memx/web_meisai/top/index.html?p01="
        +NNY+('0'+NNM).slice(-2)
    ];
    const pages = await Promise.all([
      await this.PJS.createPage(),
      await this.PJS.createPage()
    ]);
    //go to detail pages
    await Promise.all([
      await pages[0].open(URLs[0]),
      await pages[1].open(URLs[1])
    ]);
    await new Promise(resolve => {setTimeout(resolve, 10000)});
    HTMLs = await Promise.all([
      await pages[0].evaluate(function(){return document.body.innerHTML;}),
      await pages[1].evaluate(function(){return document.body.innerHTML;})
    ]);
    //create data
    for (let i = 0; i < 2; i++) {
      $ = cheerio.load(HTMLs[i]);
      if ($('h1').text() === "WEB明細書"){
        $('#meisaiTable tbody').children().slice(2, -2).each(function(){
          let columns = $(this).children();
          let date = '20'+columns.eq(1).text().replace(/\n|\r/g, "");
          if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
              === month) {
            output.push({
              date: date,
              price: -1 * parseInt(columns.eq(3).text().replace(/\n|\r|,/g, ""), 10),
              detail: columns.eq(2).text().replace(/\n|\r/g, "")
            });
          }
        });
      } else {
        $('#meisaiTable tbody').children().each(function(){
          let columns = $(this).children();
          if (!columns.eq(0).text().match(/該当/g)) {
            let date = '20'+columns.eq(0).text().replace(/\n|\r/g, "");
            if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
                === month){
              output.push({
                date: date,
                price: -1 * parseInt(columns.eq(-2).text().replace(/\n|\r|,/g, ""), 10),
                detail: columns.eq(1).text().replace(/\n|\r/g, "")
              });
            }
          }
        });
      }
    }
    await Promise.all([
      await pages[0].close(),
      await pages[1].close()
    ]);
    return output;
  }
}

module.exports  = smbc;
