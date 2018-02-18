const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const url = require('url');
//const fileCookieStore = require('tough-cookie-file-store');
const fileCookieStore = require('tough-cookie-google-drive-store');

class aeon {
  constructor ({ id, password, options }) {
    this.id = id;
    this.password = password;
    this.options = options || {};
    //const cookieJar = request.jar(new fileCookieStore(this.options.cookie || process.env.AEON_COOKIE));
    const cookieJar = request.jar(new fileCookieStore(this.options.cookie_auth, this.options.cookie_id || process.env.AEON_COOKIE));
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

  async waitInit () {
    if (!this._cookieJar.getCookies("https://ib.aeonbank.co.jp").length) {
      await new Promise(resolve => {setTimeout(resolve, 1000)});
      await this.waitInit();
    }
  }

  async login () {
    let URL, HTML, formData, headers, $;
    URL = "https://ib.aeonbank.co.jp/0040/B/B/B/C100/KBC11BN000B000.do";
    HTML = (await this._request.get(URL)).body;
    formData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        cntrId: this.id,
        scndPinNmbr: this.password
      }
    );
    URL = "https://ib.aeonbank.co.jp/0040/B/B/B/C100/KBC11BN004B001.do";
    ({headers: headers} = await this._request.post(URL, {form: formData}));
    HTML = (await this._request.get(headers['location'])).body;
    $ = cheerio.load(HTML);
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
    $ = cheerio.load(HTML);
    this.topPageFormData = qs.parse($('form').serialize());
  }

  async getDetails(year, month){
    let URL, HTML, formData, $;
    //Go to TopPage
    URL = "https://ib.aeonbank.co.jp/0040/B/B/B/A100/KBA11BN000B000.do";
    HTML = (await this._request.post(URL, {form: this.topPageFormData})).body;
    //get form data
    formData = qs.parse(cheerio.load(HTML)('form').serialize());
    //Go to detals page
    URL = "https://ib.aeonbank.co.jp/0040/B/B/B/D200/KBD21BN000B001.do";
    HTML = (await this._request.post(URL, {form: formData})).body;
    //make form data
    const lastDay = new Date();
    if (lastDay.getFullYear() !== year || lastDay.getMonth()+1 !== month) {
      lastDay.setYear(year);
      lastDay.setMonth(month);
      lastDay.setDate(0);
    }
    formData = Object.assign(
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
    URL = "https://ib.aeonbank.co.jp/0040/B/B/B/D200/KBD21BN000B003.do";
    HTML = (await this._request.post(URL, {form: formData})).body;
    $ = cheerio.load(HTML);
    //go to top page
    URL = "https://ib.aeonbank.co.jp/0040/B/B/B/A100/KBA11BN000B000.do";
    this.topPageFormData = qs.parse(
      cheerio.load(
        (await this._request.post(URL, {form: qs.parse($('form').serialize())})).body
      )('form').serialize()
    );
    //create data
    if ($('.BoxMessageStyle1.Invisibility').length) {
      var output = [];
      $('.MaxWidth.stripe-table tr').slice(1, -1).each(function(){
        const columns = $(this).children();
        if (columns.eq(0).text().match(/ありません/g)) {
          throw {message: "No Data"};
        }
        const date = columns.eq(0).text().replace(/年|月/g, "/").replace(/日| |\r|\n/g, "");
        let price
        if (columns.eq(2).text().match(/円/g)) {
          price = parseInt(columns.eq(2).text().replace(/,|円/g, ""), 10) * -1;
        } else {
          price = parseInt(columns.eq(3).text().replace(/,|円/g, ""), 10);
        }
        const detail = columns.eq(1).text().replace(/\r|\n| /g, "");
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
