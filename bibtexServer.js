var fs = require('fs');
var http = require('http');
var qs = require('querystring');
var btParser = require('bibtex-parser');
var request = require('request');
var sanitizer = require('sanitizer');

process.on('uncaughtException', function (err) {
	console.log("Uncaught exception:", err);
});

var sendIndexPage = true;
var searchable = {};
var bibTexDB = null;

function updateBibTex(bibtexContent) {
	//console.log(bibtexContent);
	//console.log('Done.\nParsing content ...');
	bibTexDB = btParser(sanitizer.sanitize(bibtexContent));
	//console.log('Done.\nCollecting a list of searchable parameters ...');
	searchable = {};
	for (var item in bibTexDB) {
		for (var param in bibTexDB[item]) searchable[param.toUpperCase()] = true;
	}
	//console.log(searchable);
	//console.log('Done.');
}

var defaultBib = 'villeteam.bib';
updateBibTex(fs.readFileSync(defaultBib,encoding='utf8'));
var isBaseLoaded = true;

function clone(a) {
   return JSON.parse(JSON.stringify(a));
}

function handleQuery(res, payload) {
	if (typeof(payload['query']) !== 'undefined') { // Things will be ANDed.
		
		var query = payload.query;
		var results = {};
		
		for (item in bibTexDB) {
			var check = true;
			for (var param in query) if (check === true) {
				var queryItem = query[param].toLowerCase();
				//console.log('Current query item: ', param.toUpperCase(), ' contains ', queryItem);
				if (searchable[param.toUpperCase()] === true) { // Such items exist that they contain the searched items.
					
					if (typeof(bibTexDB[item][param.toUpperCase()]) !== 'undefined') {
						if (bibTexDB[item][param.toUpperCase()].toLowerCase().indexOf(queryItem) < 0) check = false;
					} else check = false;
				}
			}
			
			if (check === true) results[item] = bibTexDB[item];
		}
	
		//console.log(results);
		
		//console.log('done');
		res.writeHead(200, {'Content-Type': 'application/json'});
		res.end(JSON.stringify(results, null, 4));
	}
}

var server = http.createServer( function(req, res) {
	
	// Set CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Request-Method', '*');
	res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
	res.setHeader('Access-Control-Allow-Headers', '*');
	if ( req.method === 'OPTIONS' ) {
		res.writeHead(200);
		res.end();
		return;
	}

    //console.dir(req.param);

    if (req.method === 'POST') {
        //console.log("POST");
        var body = '';
        req.on('data', function (data) {
            body += data;
            //console.log("Partial body: " + body);
			
			if (body.length > 1e6) {
				// Precaution so you can't kill the server with a large list.
                req.connection.destroy();
			}
		});
        req.on('end', function () {
			
			var bodyObj = qs.parse(body);
			
			//console.log("BodyObj: ", bodyObj);
			
			if (typeof(bodyObj['payload']) !== 'undefined') {
				
				var payload = JSON.parse(bodyObj['payload']);
				
				if (typeof(payload['bibliography']) !== 'undefined') {
					console.log('Loading a custom bibliography:', payload.bibliography);
					request(
						payload.bibliography,
						function (error, response, body) {
							if (!error && response.statusCode == 200) {
								updateBibTex(body);
								isBaseLoaded = false;
								handleQuery(res, payload);
							}
						}
					);
				} else {
					if (!isBaseLoaded) {
						console.log('Loading the default bibliography:', defaultBib);
						updateBibTex(fs.readFileSync(defaultBib, encoding='utf8'));
						isBaseLoaded = true;
					}
					handleQuery(res, payload);
				}
			}
			else req.connection.destroy();
        });
    }
    else if (sendIndexPage && req.method === 'GET') {
        //console.log("GET");
        //var html = '<html><body><form method="post" action="http://localhost:3000">Name: <input type="text" name="name" /><input type="submit" value="Submit" /></form></body>';
        
		var response = "";
		var urlStr = req.url.split('?')[0];
		if (urlStr === '/') response = fs.readFileSync('index.html');
		else response = fs.readFileSync(__dirname + urlStr);
		//console.log(__dirname + req.url);
		
        //JSON.stringify(bibTexDB, null, 4);
		res.writeHead(200, {'Content-Type': 'text/html'});
		
        res.end(response);
    }

});

var port = 9006;
var host = '127.0.0.1';
server.listen(port, host);
console.log('Listening at http://' + host + ':' + port);
