# Asynchronous Node Playstation-Network API
es6 js introduced arrow functions, asynchronous flows and classes. I've written a psn api wrapper in node to be able to use this functionality for a cleaner code in your project.

Requires a valid playstation account.

## Instructions:
1. Get the ticket_uuid(login_token) and code according to these instructions below
https://tusticles.com/psn-php/first_login.html <br/>

2. Import the library
*pre-es6:*<br/>
`var psn = require('psn-live-async');`<br/>
*es6:*<br/>
`import {getCookie, PSNHandler} from 'psn-live-async';`

3. Run getCookie function alone. You will get an npsso token you need to use for the rest of the calls.<br/>
`
getCookie(ticket_uuid, code_you_got_on_your_mobile_device).then(npsso => console.log(npsso));
`

4. Create an object<br/>
`const psnObj = new PSNHandler(npsso);`

5. Call endpoint to retreive a user's Playstation Network User Id.<br/>
`psnObj.getUserIdPSN('Ninja').then(resp => console.log(resp))`
