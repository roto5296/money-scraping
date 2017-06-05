var request = require('request-promise');
var qs = require('querystring');
var cheerio = require('cheerio');
var jschardet = require('jschardet');
var Iconv = require('iconv').Iconv;
var url = require('url');
var fileCookieStore = require('tough-cookie-filestore');

class aeon {
  constructor ({ id, password, options }) {
    this.id = id;
    this.password = password;
    this.options = options || {};
    const cookieJar = request.jar(new fileCookieStore(this.options.cookie || process.env.AEON_COOKIE));
    Object.defineProperties(this, {
      '_cookieJar': {
        value: cookieJar
      },
      '_request': {
        value: request.defaults({
          simple: false,
          resolveWithFullResponse: true,
          headers: {
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36`
          },
          jar: cookieJar
        })
      }
    });
  }

  async login () {
    var URL = "https://ib.aeonbank.co.jp/0040/B/B/B/C100/KBC11BN000B000.do";
    var {body: HTML} = await this._request.get(URL);
    var formData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        cntrId: this.id,
        scndPinNmbr: this.password
      }
    );
    var URL = "https://ib.aeonbank.co.jp/0040/B/B/B/C100/KBC11BN004B001.do";
    var res = await this._request.post(URL, {form: formData});
    var {body: HTML} = await this._request.get(res.headers['location']);
    var $ = cheerio.load(HTML);
    //aikotoba page
    if($("#title010").length){
      if (this.options.aikotoba) {
        let ans;
        for (let ai of this.options.aikotoba) {
          let question = new RegExp(ai.question);
          if (HTML.match(question)) {
            ans = ai.answer;
            break;
          }
        }
        if (ans) {
          formData = Object.assign(
            qs.parse($('form').serialize()),
            {
              wcwdAskRspo: ans,
              regiClas: 1,
              inptActvTmnlName: "鯖"
            }
          );
          URL = "https://ib.aeonbank.co.jp/0040/B/B/B/C100/KBC11BN010B001.do";
          HTML = (await this._request.post(URL, {form: formData})).body;
        } else {
          return false;
        }
      } else {
        return false;
      }
    }
    var $ = cheerio.load(HTML);
    this.topPageFormData = qs.parse($('form').serialize());
  }

  async getDetails(year, month){
    //Go to TopPage
    var URL = "https://ib.aeonbank.co.jp/0040/B/B/B/A100/KBA11BN000B000.do"
    var {body: HTML} = await this._request.post(URL, {form: this.topPageFormData});
    //get form data
    var formData = qs.parse(cheerio.load(HTML)('form').serialize());
    //Go to detals page
    var URL = "https://ib.aeonbank.co.jp/0040/B/B/B/D200/KBD21BN000B001.do";
    var {body: HTML} = await this._request.post(URL, {form: formData});
    //make form data
    var lastDay = new Date();
    if (lastDay.getYear() !== year || lastDay.getMonth()+1 !== month) {
      lastDay.setYear(year);
      lastDay.setMonth(month);
      lastDay.setDate(0);
    }
    var formData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        "dspyCond.inqrTerm": 5,
        "dspyCond.dateDsgnStrtYY": year,
        "dspyCond.dateDsgnStrtMM": ('0'+month).slice(-2),
        "dspyCond.dateDsgnStrtDD": ('0'+1).slice(-2),
        "dspyCond.dateDsgnEndYY" : year,
        "dspyCond.dateDsgnEndMM" : ('0'+month).slice(-2),
        "dspyCond.dateDsgnEndDD" : ('0'+lastDay.getDate()).slice(-2)
      }
    );
    //go to details page
    var URL = "https://ib.aeonbank.co.jp/0040/B/B/B/D200/KBD21BN000B003.do"
    var {body: HTML} = await this._request.post(URL, {form: formData});
    var $ = cheerio.load(HTML);
    //go to top page
    var URL = "https://ib.aeonbank.co.jp/0040/B/B/B/A100/KBA11BN000B000.do";
    this.topPageFormData = qs.parse(
      cheerio.load(
        (await this._request.post(URL, {form: qs.parse($('form').serialize())})).body
      )('form').serialize()
    );
    //create data
    if ($('.BoxMessageStyle1.Invisibility').length) {
      var output = [];
      $('.MaxWidth.stripe-table tr').slice(1, -1).each(function(){
        var columns = $(this).children();
        var date = columns.eq(0).text().replace(/年|月/g, "/").replace(/日| |\r|\n/g, "");
        if (columns.eq(2).text().match(/円/g)) {
          var price = parseInt(columns.eq(2).text().replace(/,|円/g, ""), 10) * -1;
        } else {
          var price = parseInt(columns.eq(3).text().replace(/,|円/g, ""), 10);
        }
        var detail = columns.eq(1).text().replace(/\r|\n| /g, "");
        output.push({
          date: date,
          price: price,
          detail: detail
        });
      });
      output.reverse();
      return output;
    } else {
      throw {message: "No Data"};
    }
  }
}

module.exports  = aeon;
