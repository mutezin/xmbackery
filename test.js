const http = require('http');

http.get('http://localhost:7000/', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Response:', data));
}).on('error', (err) => {
    console.error('Error:', err.message);
});
