const data = require('./templates_data.json');

exports.handler = async () => ({
  statusCode: 200,
  headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'},
  body: JSON.stringify(data)
});
