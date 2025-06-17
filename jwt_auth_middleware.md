
# JWT Authentication Middleware (`auth`)

## Step-by-Step Explanation

1. **Import Dependencies**
   ```js
   import jwt from "jsonwebtoken";
   import { TOKEN_SECRET } from "../config.js";
   ```
   - `jsonwebtoken` provides functions to sign and verify JSON Web Tokens (JWTs).
   - `TOKEN_SECRET` is a secret key (string) used to sign and verify tokens.

2. **Define Middleware Function**

   ```js
   export const auth = (req, res, next) => {
     try {
       const { token } = req.cookies;
       // ...
     } catch (error) {
       return res.status(500).json({ message: error.message });
     }
   };
   ```

   - Exports an Express middleware named `auth`.
   - Accepts `req`, `res`, and `next` parameters.

3. **Extract Token**

   ```js
   const { token } = req.cookies;
   if (!token)
     return res.status(401).json({ message: "No token, authorization denied" });
   ```

   - Retrieves `token` from `req.cookies`.
   - If missing, responds with HTTP 401 (Unauthorized).

4. **Verify Token**

   ```js
   jwt.verify(token, TOKEN_SECRET, (error, user) => {
     if (error) {
       return res.status(401).json({ message: "Token is not valid" });
     }
     req.user = user;
     next();
   });
   ```

   - Calls `jwt.verify` to validate the token using `TOKEN_SECRET`.
   - On error (e.g., expired or malformed token), sends 401 with message.
   - On success, decodes payload into `user`, attaches it to `req.user`, and calls `next()` to proceed.

5. **Error Handling**

   ```js
   } catch (error) {
     return res.status(500).json({ message: error.message });
   }
   ```

   - Catches synchronous runtime errors and sends HTTP 500 with error details.

---

## Functionality

At a high level, this middleware checks for the presence of a JWT in the request cookies, validates it, and attaches the decoded payload to the request object. If the token is missing or invalid, it returns an appropriate HTTP error, preventing unauthorized access to protected routes.

---

## Code Breakdown

1. **Imports**

   - `jwt` from `jsonwebtoken` for token operations.
   - `TOKEN_SECRET` from configuration.

2. **Middleware Signature**

   ```js
   export const auth = (req, res, next) => { ... }
   ```

   Follows the Express middleware pattern.

3. **Token Extraction**

   ```js
   const { token } = req.cookies;
   ```

   Destructures the `token` property from `req.cookies`.

4. **Authorization Check**

   - If no token: `res.status(401).json({ message: "No token, authorization denied" });`

5. **Token Verification**

   - `jwt.verify(token, TOKEN_SECRET, callback)`: asynchronously validates token.
   - On success: `req.user = user; next();`
   - On failure: `res.status(401).json({ message: "Token is not valid" });`

6. **Exception Handling**
   Ensures any thrown errors are caught and result in HTTP 500.

---

## Usage Examples

### Protecting a Route

```js
import express from 'express';
import cookieParser from 'cookie-parser';
import { auth } from './middleware/auth.js';

const app = express();
app.use(cookieParser());

// Public route
app.get('/public', (req, res) => {
  res.send('Anyone can access this.');
});

// Protected route
app.get('/dashboard', auth, (req, res) => {
  res.send(`Welcome, ${req.user.name}!`);
});
```

### Sample Token Payload

```json
{
  "id": "12345",
  "name": "Alice",
  "role": "admin"
}
```

### Sample Request & Response

- **Request**: GET `/dashboard` with cookie `token=<valid_jwt>`
- **Response**: `200 OK` with body `Welcome, Alice!`

- **Request**: GET `/dashboard` with no token
- **Response**: `401 Unauthorized` with JSON `{ "message": "No token, authorization denied" }`

---

## Key Points

- **JWT**: Stateless authentication mechanism.
- **Express Middleware**: Clean separation for auth logic.
- **Cookie-based**: Reads token from cookies; can be adapted for headers.
- **Error Responses**: Uses appropriate HTTP status codes (401, 500).

---

## Potential Improvements

1. **Token Location Flexibility**: Support tokens in `Authorization` header (Bearer) or query params.
2. **Async/Await**: Wrap `jwt.verify` in a promise for `async`/`await` style.
3. **Logging**: Add structured logging for audit trails.
4. **Configuration**: Externalize status messages and codes.
5. **Role-based Access**: Extend middleware to check `req.user.role` against permissions.
6. **Token Refresh**: Implement logic to refresh near-expiry tokens.

---

## Security Vulnerability Checks

1. **Token Secret Exposure**: Ensure `TOKEN_SECRET` is stored securely (environment variables, vault).
2. **Token Expiry**: Verify tokens include expiration (`exp`) claim; reject expired tokens.
3. **Cookie Flags**: Use `HttpOnly`, `Secure`, and `SameSite` flags when setting cookies.
4. **Brute Force Protection**: Rate-limit endpoints to prevent repeated invalid token attempts.
5. **Signature Algorithm**: Avoid `none` algorithm; enforce `HS256` or stronger.
6. **Error Leakage**: Avoid sending raw error messages to clients; log internally instead.
