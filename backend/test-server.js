const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'test server working', timestamp: new Date().toISOString() }));
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Test server listening on port ${PORT}`);
});