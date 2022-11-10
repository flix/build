///////////////////////////////////////////////////////////////////////////////
// Imports                                                                   //
///////////////////////////////////////////////////////////////////////////////
var execa = require('execa');
var mysql = require('mysql');
var fs = require("fs");
var http = require('http')

///////////////////////////////////////////////////////////////////////////////
// Paths                                                                     //
///////////////////////////////////////////////////////////////////////////////
var JAR_PATH = './flix/build/libs/flix.jar';

///////////////////////////////////////////////////////////////////////////////
// Parse Command Line Arguments                                              //
///////////////////////////////////////////////////////////////////////////////
var hostname = process.argv[2]
var username = process.argv[3]
var password = process.argv[4]
var command = process.argv[5]
var grafana_key = process.argv[6]

if (!hostname) {
    throw new Error("Missing hostname.");
}

if (!username) {
    throw new Error("Missing username");
}

if (!password) {
    throw new Error("Missing password");
}

if (!command) {
    throw new Error("Missing command");
}

///////////////////////////////////////////////////////////////////////////////
// Configure Mysql Connection                                                //
///////////////////////////////////////////////////////////////////////////////
function newConnection() {
    return mysql.createConnection({
        host: hostname,
        user: username,
        password: password,
        database: 'flix'
    });
}

///////////////////////////////////////////////////////////////////////////////
// Timestamp                                                                 //
///////////////////////////////////////////////////////////////////////////////
function getCurrentUnixTime() {
    return (new Date().getTime() / 1000);
}

///////////////////////////////////////////////////////////////////////////////
// Git Clone and Pull                                                        //
///////////////////////////////////////////////////////////////////////////////
function gitClone() {
    execa.sync('git', ['clone', 'https://github.com/flix/flix.git']);
}

function gitPull() {
    execa.sync('git', ['-C', './flix/', 'pull']);
}

function gitCloneOrPull() {
    if (!fs.existsSync("./flix/")) {
        gitClone()
    } else {
        gitPull()
    }
}

///////////////////////////////////////////////////////////////////////////////
// Gradle Build                                                              //
///////////////////////////////////////////////////////////////////////////////
function gradleBuild() {
    execa.sync('./gradlew', ['clean'], {"cwd": "./flix/"});

    var t = getCurrentUnixTime();
    execa.sync('./gradlew', ['jar'], {"cwd": "./flix/"});
    var e = getCurrentUnixTime() - t;

    // Connect and Insert into MySQL.
    var connection = newConnection()
    connection.connect();
    connection.query(
        "INSERT INTO build VALUES (?, NOW(), ?)",
        ["build", e],
        function (error, results, fields) {
            if (error) throw error;
        });
    connection.end();
}

///////////////////////////////////////////////////////////////////////////////
// Gradle Test                                                               //
///////////////////////////////////////////////////////////////////////////////
function gradleTest() {
    var t = getCurrentUnixTime();
    execa.sync('./gradlew', ['test'], {"cwd": "./flix/"});
    var e = getCurrentUnixTime() - t;

    // Connect and Insert into MySQL.
    var connection = newConnection()
    connection.connect();
    connection.query(
        "INSERT INTO build VALUES (?, NOW(), ?)",
        ["test", e],
        function (error, results, fields) {
            if (error) throw error;
        });
    connection.end();
}

///////////////////////////////////////////////////////////////////////////////
// Throughput                                                                //
///////////////////////////////////////////////////////////////////////////////
function benchmarkThroughput() {
    // Command to execute.
    var result = execa.sync('java', ['-jar', JAR_PATH, '--Xbenchmark-throughput', '--json']);

    // Parse the result JSON.
    var json = JSON.parse(result.stdout)
    var lines = json.lines;
    var threads = json.threads;
    var iterations = json.iterations;
    var minThroughput = json.throughput.min;
    var maxThroughput = json.throughput.max;
    var avgThroughput = json.throughput.avg;
    var medianThroughput = json.throughput.median;

    // Connect and Insert into MySQL.
    var connection = newConnection()
    connection.connect();
    connection.query(
        "INSERT INTO throughput_ext VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)",
        [lines, threads, iterations, minThroughput, maxThroughput, avgThroughput, medianThroughput],
        function (error, results, fields) {
            if (error) throw error;
        });
    connection.end();
}

///////////////////////////////////////////////////////////////////////////////
// Phases                                                                    //
///////////////////////////////////////////////////////////////////////////////
function benchmarkPhases() {
    // Command to execute.
    var result = execa.sync('java', ['-jar', JAR_PATH, '--Xbenchmark-phases', '--json']);

    // Parse the result JSON.
    var json = JSON.parse(result.stdout)
    var lines = json.lines;
    var threads = json.threads;
    var iterations = json.iterations;
    var phases = json.phases;

    // Connect to MySQL.
    var connection = newConnection()
    connection.connect();
    phases.forEach(function (elm) {
        var phase = elm.phase;
        var time = elm.time;

        // Insert into MySQL.
        connection.query(
            "INSERT INTO phase_ext VALUES (NOW(), ?, ?, ?, ?, ?)",
            [phase, lines, threads, iterations, time],
            function (error, results, fields) {
                if (error) throw error;
            });
    })
    connection.end();
}

///////////////////////////////////////////////////////////////////////////////
// Phases Incremental                                                        //
///////////////////////////////////////////////////////////////////////////////
function benchmarkPhasesIncremental() {
    // Command to execute.
    var result = execa.sync('java', ['-jar', JAR_PATH, '--Xbenchmark-incremental', '--json']);

    // Parse the result JSON.
    var json = JSON.parse(result.stdout)
    var lines = json.lines;
    var threads = json.threads;
    var iterations = json.iterations;
    var phases = json.phases;

    // Connect to MySQL.
    var connection = newConnection()
    connection.connect();
    phases.forEach(function (elm) {
        var phase = elm.phase;
        var time = elm.time;

        // Insert into MySQL.
        connection.query(
            "INSERT INTO phase_incremental VALUES (NOW(), ?, ?, ?, ?, ?)",
            [phase, lines, threads, iterations, time],
            function (error, results, fields) {
                if (error) throw error;
            });
    })
    connection.end();
}

///////////////////////////////////////////////////////////////////////////////
// Code Size                                                                 //
///////////////////////////////////////////////////////////////////////////////
function benchmarkCodeSize() {
    // Command to execute.
    var result = execa.sync('java', ['-jar', JAR_PATH, '--Xbenchmark-code-size', '--json']);

    // Parse the result JSON.
    var json = JSON.parse(result.stdout)
    var lines = json.lines;
    var bytes = json.codeSize;

    // Connect to MySQL.
    var connection = newConnection()
    connection.connect();

    // Insert into MySQL.
    connection.query(
        "INSERT INTO codesize VALUES (NOW(), ?, ?)",
        [lines, bytes],
        function (error, results, fields) {
            if (error) throw error;
        });
    connection.end();
}

///////////////////////////////////////////////////////////////////////////////
// Benchmarks                                                                //
///////////////////////////////////////////////////////////////////////////////
function benchmarkBenchmarks() {
    // Command to execute.
    var result = execa.sync('java', ['-jar', JAR_PATH, '--benchmark', '--json', 'flix/main/src/resources/benchmark/BenchmarkList.flix']);

    // Parse the result JSON.
    var json = JSON.parse(result.stdout)
    var threads = json.threads;
    var benchmarks = json.benchmarks;

    // Connect to MySQL.
    var connection = newConnection()
    connection.connect();
    benchmarks.forEach(function (elm) {
        var name = elm.name;
        var time = elm.time;

        // Insert into MySQL.
        connection.query(
            "INSERT INTO benchmark_ext VALUES (NOW(), ?, ?, ?)",
            [threads, name, time],
            function (error, results, fields) {
                if (error) throw error;
            });
    })
    connection.end();
}


///////////////////////////////////////////////////////////////////////////////
// Benchmarks                                                                //
///////////////////////////////////////////////////////////////////////////////
function commits() {
    // Pull the log in format (hash <tab> time <tab> message)
    // Limit to the last month
    var result = execa.sync('git', ['-C', './flix/', 'log', '--pretty=%H\t%ct\t%s', '--since=1 month ago']);

    // Parse the command output
    var lines = result.stdout.split("\n");
    var rows = lines.map((line) => line.split("\t"));

    // Connect tot MySQL
    var connection = newConnection();
    connection.connect();
    // Add each log message to the database
    rows.forEach((row) => {
        var hash = row[0];
        var time = row[1];
        var full_message = row[2];
        // truncate the message to 255 characters
        var message = full_message.substring(0, 255);

        connection.query(
            "INSERT INTO commits VALUES (?, FROM_UNIXTIME(?), ?, NULL)",
            [hash, time, message],
            function (error, results, fields) {
                if (error) throw error;
            });
    })
    connection.end();

}

function annotations() {

    // Connect to MySQL
    var connection = newConnection();
    connection.connect();

    // Get all the commits with no associated annotation.
    connection.query(
        "SELECT * FROM commits WHERE id IS NULL",
        function (error, results, fields) {
            if (error) throw error;
            results.forEach((row) => {

                console.log("sha: " + row.sha)

                // build a request for the Grafana dashboard
                var data = JSON.stringify({
                    dashboardUID: "agdciz4k",
                    panelId: 6,
                    time: row.time.getTime(),
                    timeEnd: row.time.getTime(),
                    text: row.message,
                    tags: [],
                });

                var options = {
                    host: hostname,
                    port: '3000',
                    path: '/api/annotations',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': "Bearer " + grafana_key,
                        'Content-Length': Buffer.byteLength(data)
                    }
                };

                // make the request to Grafana
                var request = http.request(options, (response) => {
                    response.on("data", (json) => {
                        
                        // add the returned ID to the database
                        var id = JSON.parse(json).id
                        connection.query(
                            "UPDATE commits SET id = (?) WHERE sha = (?)",
                            [id, row.sha], 
                            function (error, results, fields) {
                                if (error) throw error;
                            }
                        )
                    });
                });
                request.write(data);
                request.end();

                
            })
            connection.end()
        }
    );

}

///////////////////////////////////////////////////////////////////////////////
// Main                                                                      //
///////////////////////////////////////////////////////////////////////////////

// Always clone or pull.
gitCloneOrPull()

// Branch on the command.
if (command === "build") {
    gradleBuild()
} else if (command === "test") {
    gradleTest()
} else if (command === "throughput") {
    benchmarkThroughput()
} else if (command === "phases") {
    benchmarkPhases()
} else if (command === "incremental") {
    benchmarkPhasesIncremental()
} else if (command === "codesize") {
    benchmarkCodeSize();
} else if (command === "benchmarks") {
    benchmarkBenchmarks()
} else if (command === "commits") {
    commits()
} else if (command === "annotations") {
    annotations()
} else {
    throw new Error("Unknown command: " + command)
}
