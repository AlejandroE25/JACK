let response = document.getElementById("response-text")
let queryText = document.getElementById("query-text")

window.onload = function() {
    //connect to the websocket server
    connect()
    currentTime()
}

// Current time display
function currentTime() {
    let date = new Date();
    let hh = date.getHours();
    let mm = date.getMinutes();
    let ss = date.getSeconds();
    let session = "AM";

    if(hh == 0){
        hh = 12;
    }
    if(hh > 12){
        hh = hh - 12;
        session = "PM";
    }

    hh = (hh < 10) ? "0" + hh : hh;
    mm = (mm < 10) ? "0" + mm : mm;

    let time = hh + ":" + mm + " " + session;

    document.getElementById("time").innerText = time;
    let t = setTimeout(function(){ currentTime() }, 1000);
}

// WebSocket connection
function connect() {
    ws = new WebSocket("ws://73.246.38.149:9001");
    ws.onmessage = function (evt) {
        let received_msg = evt.data;

        // Split response at '$$'
        let splitResponse = received_msg.split("$$");
        let query = splitResponse[0];
        let responseMsg = splitResponse[1];

        // Update message containers with HTML escaping
        queryText.innerHTML = escapeHtml(query);
        response.innerHTML = escapeHtml(responseMsg);

        // Scroll to bottom of chat
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    ws.onclose = function() {
        console.log("Connection is closed...");
        setTimeout(connect, 1000);
    }
}

// HTML escaping for security
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Input handling
let inputline = document.getElementById("inputline")
inputline.addEventListener('keydown', function(e) {
    if (e.keyCode === 13 && inputline.value.trim() !== "") {
        ws.send(inputline.value);
        inputline.value = "";
    }
});
