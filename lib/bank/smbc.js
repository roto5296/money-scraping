const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const Iconv = require('iconv').Iconv;
const url = require('url');

class smbc {
  constructor ({ branch, no, password, options }) {
    this.branch = branch;
    this.no = no;
    this.password = password;
    this.options = options || {};
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
      '_getURL': {
        value: "https://direct3.smbc.co.jp/servlet/com.smbc.SUPGetServlet"
      },
      '_postURL': {
        value: "https://direct3.smbc.co.jp/servlet/com.smbc.SUPPostServlet"
      },
      '_redirectURL': {
        value: "https://direct3.smbc.co.jp/servlet/com.smbc.SUPRedirectServlet"
      },
      '_iconv': {
        value: new Iconv('SHIFT_JIS','UTF-8//TRANSLIT//IGNORE')
      }
    });
  }

  async waitInit () {}

  async login () {
    let URL, HTML, postData;
    URL = "https://direct.smbc.co.jp/aib/aibgsjsw5001.jsp";
    HTML = (await this._request.get(URL)).body;
    postData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        S_BRANCH_CD: this.branch,
        S_ACCNT_NO: this.no,
        PASSWORD: this.password
      }
    );
    await this._request.post(this._postURL, {form: postData});
  }

  async getDetails(year, month){
    let HTML, $, queryData;
    //go to TopPage
    HTML = (await this._request.get(this._redirectURL, {encoding: null})).body;
    //get Query to get details
    const lastDay = new Date();
    if (lastDay.getFullYear() !== year || lastDay.getMonth()+1 !== month) {
      lastDay.setYear(year);
      lastDay.setMonth(month);
      lastDay.setDate(0);
    }
    queryData = Object.assign(
      qs.parse(
        url.parse(
          cheerio.load(
            this._iconv.convert(HTML).toString()
          )('.detailsBtn a').attr('href')
        ).query
      ),
      {
        FromYear:  ('0'+(year-1988)).slice(-2),
        FromMonth: ('0'+month).slice(-2),
        FromDate:  ('0'+1).slice(-2),
        ToYear:    ('0'+(year-1988)).slice(-2),
        ToMonth:   ('0'+month).slice(-2),
        ToDate:    ('0'+lastDay.getDate()).slice(-2)
      }
    );
    //go to details page
    HTML = (await this._request.get(this._getURL, {qs: queryData, encoding: null})).body;
    $ = cheerio.load(this._iconv.convert(HTML).toString());
    //create data
    if (!$('.CMNerrorMessage').length){
      let output = [];
      $('table.tableStyle.table02.table05.js-even tr').slice(1, -1).each(function(){
        const columns = $(this).children();
        const dateString = columns.eq(0).text().split('.');
        const date = (1988+parseInt(dateString[0].substr(1),10)).toString()
            + "/"
            + dateString[1].replace(/ /g,"0")
            + "/"
          + dateString[2].replace(/ /g,"0");
        let price;
        if (columns.eq(1).text() !== "　") {
          price = parseInt(columns.eq(1).text().replace(/,/g, ""), 10) * -1;
        } else {
          price = parseInt(columns.eq(2).text().replace(/,/g, ""), 10);
        }
        output.push({
          date: date,
          price: price,
          detail: columns.eq(3).text()
        });
      });
      //go to TopPage
      queryData =qs.parse(
        url.parse($('.glNav01 a').attr('href')).query
      );
      await this._request.get(this._getURL, {qs: queryData});
      return output;
    } else {
      throw {message: "No Data"};
    }
  }
}

module.exports  = smbc;
