const Koa = require('koa');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const route = require('koa-route');
const websockify = require('koa-websocket');

let users = {};
try {
    users = JSON.parse(fs.readFileSync('./users.json', 'utf-8'));
} catch (e) {
    console.error("Nu putim citi `users.json`.");
}



const onlineClients = new Map();
const option = {
    httpOnly: false,
    secure: false,
    sameSite: 'lax',
    path: '/',
};
const secretKey = '564798ty9GJHB%^&*(KJNLK';
const app = websockify(new Koa());

function brodcastOnlineUsers(){
    const usersList = [...onlineClients.values()];
    console.log(`Lista utilizatori online:`, usersList)
    const message = {
        type: 'user-list',
        users: usersList
    }
    const jsonMessage = JSON.stringify(message);
    onlineClients.forEach((user, clientSocket) => {
        if (clientSocket.readyState === clientSocket.OPEN) {
            clientSocket.send(jsonMessage);
        }
    })

}


app.ws.use(route.all('/ws', function (ctx) {
    const token = ctx.cookies.get('token');
    if (!token) {
        return ctx.websocket.close();
    }
    try {
        const { username } = jwt.verify(token, secretKey);
        onlineClients.set(ctx.websocket, username);
        console.log(`${username} connected. Total online: ${onlineClients.size}`);
        brodcastOnlineUsers();
        ctx.websocket.send(`Hello ${username}, welcome to the WebSocket server!`);

        ctx.websocket.on('message', function (message) {
            onlineClients.forEach((user, clientSocket) => {
                if (clientSocket.readyState === clientSocket.OPEN) {
                    clientSocket.send(`${username}: ${message}`);
                }
            });
        });

        ctx.websocket.on('close', () => {
            if (onlineClients.has(ctx.websocket)) {
                const disconnectedUser = onlineClients.get(ctx.websocket);
                onlineClients.delete(ctx.websocket);
                console.log(`${disconnectedUser} disconnected. Total online: ${onlineClients.size}`);
                brodcastOnlineUsers();
            }
        });
    } catch (err) {
        console.error('Invalid token for WebSocket connection:', err.message);
        ctx.websocket.close();
    }
}));

app
    
    .use(async (ctx, next) => {
        if (['/', '/index.html'].includes(ctx.url)) {
            let username = null;
            const token = ctx.cookies.get('token');
            if (token) {
                try {
                    username = jwt.verify(token, secretKey).username;
                } catch (err) {
                    console.log('Token invalid');
                }
            }
            const responseHtml = username ? './welcome.html' : './index.html';
            const content = fs.readFileSync(responseHtml, 'utf-8');
            ctx.body = content.replace('@username', username || 'Guest');
            return; 
        }
        await next(); 
    })

    .use(async (ctx, next) => {
        if (ctx.url.startsWith('/login')) { 
            const { username, password } = ctx.query;

            if(!username || !password){
                console.log('Username or password missing');
                return ctx.redirect('/');
            }
            if(users[username]){
                if (users[username] === password) {
                    console.log(`User ${username} logged in successfully.`);
                    const token = jwt.sign({ username }, secretKey, { expiresIn: '1h' });
                    ctx.cookies.set('token', token, option);
                    const content = fs.readFileSync('./welcome.html', 'utf-8');
                    ctx.body = content.replace('@username', username);
                } else {
                    console.log(`Login failed for user ${username}: Incorrect password.`);
                    ctx.redirect('/');
                }
            } else {
                console.log(`User ${username} has been created.`);
                users[username] = password;
                try {
                    fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
                } catch (err) {
                    console.error('Error saving users:', err);
                    return ctx.redirect('/');
                }
                const token = jwt.sign({ username }, secretKey, { expiresIn: '1h' });
                ctx.cookies.set('token', token, option);
                const content = fs.readFileSync('./welcome.html', 'utf-8');
                ctx.body = content.replace('@username', username);
            }
            return
        }
        await next(); 
    })

    .use(async (ctx, next) => {
        if (ctx.url.includes('/chatPage')) {
            const token = ctx.cookies.get('token');
            if (!token) {
                return ctx.redirect('/');
            }
            try {
                jwt.verify(token, secretKey);
                ctx.type = 'html';
                ctx.body = fs.readFileSync('./chatPage.html', 'utf-8');
            } catch (error) {
                console.log('Token invalid');
                ctx.redirect('/');
            }
            return; 
        }
        await next(); 
    })

    .use(async ctx => {
        ctx.body = 'Hello World';
    });


app.listen(80)
    console.log('Serverul a pornit pe http://localhost');
