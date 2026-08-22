const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  const file = path.join(__dirname, 'watchlist_data.json');
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'},
    body: JSON.stringify({items})
  };
};
