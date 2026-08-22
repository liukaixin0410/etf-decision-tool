const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  const file = path.join(__dirname, 'templates_data.json');
  const data = fs.readFileSync(file, 'utf8');
  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'},
    body: data
  };
};
