const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const Iconv = require('iconv').Iconv;
const url = require('url');
const phantom = require('phantom');

class rakuten {
  constructor ({ id, password, options }) {
    this.id = id;
    this.password = password;
    this.options = options || {};
    this.PJS = null;
    const cookieJar = request.jar();
    Object.defineProperties(this, {
      '_cookieJar': {
        value: cookieJar
      },
      '_request': {
        value: request.defaults({
          simple: false,
          resolveWithFullResponse: true,
          headers: {
            'User-Agent': `Mozilla/5.0 SMBC/1.0`
          },
          jar: cookieJar
        })
      },
      '_iconv': {
        value: new Iconv('SHIFT_JIS','UTF-8//TRANSLIT//IGNORE')
      }
    });
  }

  async waitInit () {}

  async login () {
    let URL, HTML, postData, headers;
    this.PJS = await phantom.create(['--ignore-ssl-errors=yes']);
    const loginPage = await this.PJS.createPage();
    await new Promise(resolve => {setTimeout(resolve, 3000)});
    URL = "https://www.rakuten-card.co.jp/e-navi/";
    await loginPage.open(URL);
    await new Promise(resolve => {setTimeout(resolve, 3000)});
    HTML = await loginPage.evaluate(function(){return document.body.innerHTML;});
    postData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').eq(0).serialize()),
      {
        u: this.id,
        p: this.password
      }
    );
    URL = "https://grp01.id.rakuten.co.jp/rms/nid/login?";
    headers = (await this._request.post(URL, {form: postData})).headers;
    await this._request.get(headers['location']);
  }

  async getDetails(year, month){
    let URL, HTML, $, queryData;
    //go to details page
    URL = "https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml?tabNo=0"
    HTML = (await this._request.get(URL)).body;
    $ = cheerio.load(HTML);
    const latestY = parseInt($('.stmt-calendar__cmd__now').text().match(/(\d+)年(\d+)月/)[1]);
    const latestM = parseInt($('.stmt-calendar__cmd__now').text().match(/(\d+)年(\d+)月/)[2]);
    const diff = (year - latestY) * 12 + (month - latestM) + 1;
    const checkPages = [];
    if (diff === 0 || diff === 1) {
      checkPages.push(0);
    } else if (diff < 0 && diff > -15) {
      checkPages.push(-1 * diff -1);
      checkPages.push(-1 * diff);
    } else if (diff === -15) {
      checkPages.push(14);
    } else {
      throw {message: "No Data"};
    }
    const output = [];
    for (let checkPage of checkPages) {
      URL = "https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml?tabNo="+checkPage;
      HTML = (await this._request.get(URL)).body;
      $ = cheerio.load(HTML);
      //create data
      var dateIndex;
      var priceIndex;
      var detailIndex;
      $('.stmt-current-payment-list-head .stmt-payment-lists__tbl').children().each(function(index){
        if ($(this).text().match(/利用日/g)) {
          dateIndex = index;
        }
        if ($(this).text().match(/金額/g)) {
          priceIndex = index;
        }
        if ($(this).text().match(/商品名/g)) {
          detailIndex = index;
        }
      });
      $('.stmt-current-payment-list-body .stmt-payment-lists__tbl').each(function(){
        const columns = $(this).children();
        const date = columns.eq(dateIndex).text().replace(/\s/g, "");
        if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
            === month) {
          output.push({
            date: date,
            price: -1 * parseInt(columns.eq(priceIndex).text().replace(/,|\s|(\u005C)|(\u00A5)/g, ""), 10),
            detail: columns.eq(detailIndex).text().replace(/ *$|\n/g, "").replace(/( |　)+/g, " ")
          });
        }
      });
    }
    return output.reverse();
  }
}

module.exports  = rakuten;
