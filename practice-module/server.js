
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is missing in .env");
}

/*
|--------------------------------------------------------------------------
| Paths
|--------------------------------------------------------------------------
*/

const WORDS_FILE = path.join(__dirname, "words.json");
const PUBLIC_FOLDER = path.join(__dirname, "public");

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(express.json());
app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| MySQL
|--------------------------------------------------------------------------
*/

const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "english_practice",
};

let db;

async function initializeDatabase() {

    /*
    |--------------------------------------------------------------------------
    | First connect without selecting a database
    |--------------------------------------------------------------------------
    */

    const connection = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
    });

    /*
    |--------------------------------------------------------------------------
    | Create database
    |--------------------------------------------------------------------------
    */

    await connection.query(`
        CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
    `);

    await connection.end();

    /*
    |--------------------------------------------------------------------------
    | Create connection pool
    |--------------------------------------------------------------------------
    */

    db = mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: 10,
        charset: "utf8mb4",
    });

    /*
    |--------------------------------------------------------------------------
    | Users
    |--------------------------------------------------------------------------
    */

    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

            full_name VARCHAR(100) NOT NULL,

            email VARCHAR(255) NOT NULL UNIQUE,

            password_hash VARCHAR(255) NOT NULL,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    /*
    |--------------------------------------------------------------------------
    | User progress
    |
    | One row per user.
    |
    | current_index tells us which word the user should practice next.
    |--------------------------------------------------------------------------
    */

    await db.query(`
        CREATE TABLE IF NOT EXISTS user_progress (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

            user_id BIGINT UNSIGNED NOT NULL UNIQUE,

            current_index INT UNSIGNED NOT NULL DEFAULT 0,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,

            CONSTRAINT fk_user_progress_user
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    `);

    /*
    |--------------------------------------------------------------------------
    | Practiced words
    |
    | Only words that a user has actually practiced are stored.
    |--------------------------------------------------------------------------
    */

    await db.query(`
        CREATE TABLE IF NOT EXISTS practiced_words (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

            user_id BIGINT UNSIGNED NOT NULL,

            word VARCHAR(255) NOT NULL,

            completed BOOLEAN NOT NULL DEFAULT TRUE,

            count INT UNSIGNED NOT NULL DEFAULT 1,

            last_practiced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            UNIQUE KEY unique_user_word (user_id, word),

            CONSTRAINT fk_practiced_words_user
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    `);

    /*
    |--------------------------------------------------------------------------
    | Password reset tokens
    |--------------------------------------------------------------------------
    */

    await db.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

            user_id BIGINT UNSIGNED NOT NULL,

            token_hash CHAR(64) NOT NULL UNIQUE,

            expires_at DATETIME NOT NULL,

            used_at DATETIME NULL,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_password_reset_user
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    `);

    console.log("✅ MySQL database initialized");
}

/*
|--------------------------------------------------------------------------
| Authentication Cookie
|--------------------------------------------------------------------------
*/

const AUTH_COOKIE_NAME = "english_practice_token";

const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,

    /*
     * Prevents the browser from sending the cookie
     * in cross-site requests in normal situations.
     */
    sameSite: "lax",

    /*
     * When deployed with HTTPS, this becomes true.
     */
    secure: process.env.NODE_ENV === "production",

    /*
     * Login expires after 7 days.
     */
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

/*
|--------------------------------------------------------------------------
| Authentication helpers
|--------------------------------------------------------------------------
*/

function createAuthToken(user) {

    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
        },
        JWT_SECRET,
        {
            expiresIn: "7d",
        }
    );
}

function setAuthCookie(res, user) {

    const token = createAuthToken(user);

    res.cookie(
        AUTH_COOKIE_NAME,
        token,
        AUTH_COOKIE_OPTIONS
    );
}

function clearAuthCookie(res) {

    res.clearCookie(
        AUTH_COOKIE_NAME,
        AUTH_COOKIE_OPTIONS
    );
}

/*
|--------------------------------------------------------------------------
| Authentication middleware
|--------------------------------------------------------------------------
*/

function requireAuth(req, res, next) {

    const token = req.cookies[AUTH_COOKIE_NAME];

    if (!token) {

        return res.status(401).json({
            success: false,
            message: "Authentication required.",
        });
    }

    try {

        const decoded = jwt.verify(
            token,
            JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {

        clearAuthCookie(res);

        return res.status(401).json({
            success: false,
            message: "Session expired. Please login again.",
        });
    }
}

/*
|--------------------------------------------------------------------------
| Utility functions
|--------------------------------------------------------------------------
*/

function normalizeEmail(email) {

    return String(email || "")
        .trim()
        .toLowerCase();
}

function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {

    if (typeof password !== "string") {
        return false;
    }

    /*
     * Minimum 8 characters
     * At least one letter
     * At least one number
     */

    return (
        password.length >= 8 &&
        /[A-Za-z]/.test(password) &&
        /\d/.test(password)
    );
}

function hashResetToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

/*
|--------------------------------------------------------------------------
| Pages
|--------------------------------------------------------------------------
*/

/*
 * Root → login
 */

app.get("/", (req, res) => {

    res.redirect("/login.html");

});

/*
 * Practice page
 *
 * IMPORTANT:
 * We protect the page itself.
 */

app.get("/practice", (req, res) => {

    const token = req.cookies[AUTH_COOKIE_NAME];

    if (!token) {

        return res.redirect("/login.html");

    }

    try {

        jwt.verify(
            token,
            JWT_SECRET
        );

        res.sendFile(
            path.join(PUBLIC_FOLDER, "index.html")
        );

    } catch (error) {

        clearAuthCookie(res);

        res.redirect("/login.html");

    }

});

/*
 * Login page
 */

app.get("/login.html", (req, res) => {

    res.sendFile(
        path.join(PUBLIC_FOLDER, "login.html")
    );

});

/*
 * Forgot password page
 */

app.get("/forgot-password.html", (req, res) => {

    res.sendFile(
        path.join(PUBLIC_FOLDER, "forgot-password.html")
    );

});

/*
 * Reset password page
 */

app.get("/reset-password.html", (req, res) => {

    res.sendFile(
        path.join(PUBLIC_FOLDER, "reset-password.html")
    );

});

/*
|--------------------------------------------------------------------------
| Static files
|--------------------------------------------------------------------------
|
| index.html is NOT automatically served because we don't use
| express.static with index enabled.
|
*/

app.use(
    express.static(
        PUBLIC_FOLDER,
        {
            index: false,
        }
    )
);

/*
|--------------------------------------------------------------------------
| AUTH API
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Signup
|--------------------------------------------------------------------------
*/

app.post("/api/auth/signup", async (req, res) => {

    try {

        const {
            fullName,
            email,
            password,
        } = req.body;

        const cleanName = String(
            fullName || ""
        ).trim();

        const cleanEmail =
            normalizeEmail(email);

        /*
         * Validate name
         */

        if (cleanName.length < 2) {

            return res.status(400).json({
                success: false,
                message: "Please enter your full name.",
            });

        }

        /*
         * Validate email
         */

        if (!isValidEmail(cleanEmail)) {

            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address.",
            });

        }

        /*
         * Validate password
         */

        if (!isValidPassword(password)) {

            return res.status(400).json({
                success: false,
                message:
                    "Password must be at least 8 characters and contain letters and numbers.",
            });

        }

        /*
         * Check if email already exists
         */

        const [existingUsers] =
            await db.query(
                `
                SELECT id
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [cleanEmail]
            );

        if (existingUsers.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "An account with this email already exists.",
            });

        }

        /*
         * Hash password
         */

        const passwordHash =
            await bcrypt.hash(
                password,
                12
            );

        /*
         * Create user
         */

        const [result] =
            await db.query(
                `
                INSERT INTO users
                    (full_name, email, password_hash)
                VALUES
                    (?, ?, ?)
                `,
                [
                    cleanName,
                    cleanEmail,
                    passwordHash,
                ]
            );

        const userId =
            result.insertId;

        /*
         * Create initial progress.
         *
         * current_index = 0
         *
         * Therefore every new user starts
         * from Word #1.
         */

        await db.query(
            `
            INSERT INTO user_progress
                (user_id, current_index)
            VALUES
                (?, 0)
            `,
            [userId]
        );

        /*
         * Login immediately after signup.
         */

        setAuthCookie(
            res,
            {
                id: userId,
                email: cleanEmail,
            }
        );

        return res.status(201).json({

            success: true,

            message:
                "Account created successfully.",

            redirect: "/practice",

        });

    } catch (error) {

        console.error(
            "Signup error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to create account.",

        });

    }

});

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

app.post("/api/auth/login", async (req, res) => {

    try {

        const email =
            normalizeEmail(
                req.body.email
            );

        const password =
            req.body.password;

        if (!isValidEmail(email)) {

            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address.",
            });

        }

        const [users] =
            await db.query(
                `
                SELECT
                    id,
                    email,
                    password_hash
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [email]
            );

        if (users.length === 0) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid email or password.",
            });

        }

        const user =
            users[0];

        /*
         * Compare entered password
         * against bcrypt hash.
         */

        const passwordMatches =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!passwordMatches) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid email or password.",
            });

        }

        /*
         * Create authentication cookie.
         */

        setAuthCookie(
            res,
            user
        );

        return res.json({

            success: true,

            message:
                "Login successful.",

            redirect: "/practice",

        });

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to login.",

        });

    }

});

/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
*/

app.post("/api/auth/logout", (req, res) => {

    clearAuthCookie(res);

    res.json({
        success: true,
        message: "Logged out successfully.",
    });

});

/*
|--------------------------------------------------------------------------
| Current user
|--------------------------------------------------------------------------
*/

app.get(
    "/api/auth/me",
    requireAuth,
    async (req, res) => {

        try {

            const [users] =
                await db.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email,
                        created_at
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [req.user.userId]
                );

            if (users.length === 0) {

                clearAuthCookie(res);

                return res.status(401).json({
                    success: false,
                    message: "User not found.",
                });

            }

            res.json({

                success: true,

                user: users[0],

            });

        } catch (error) {

            console.error(
                "Get user error:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to load user.",

            });

        }

    }
);

/*
|--------------------------------------------------------------------------
| FORGOT PASSWORD
|--------------------------------------------------------------------------
*/

/*
 * Create Nodemailer transporter.
 */

function createMailTransporter() {

    if (
        !process.env.MAIL_HOST ||
        !process.env.MAIL_USER ||
        !process.env.MAIL_PASSWORD
    ) {

        throw new Error(
            "Email configuration is missing in .env"
        );

    }

    return nodemailer.createTransport({

        host: process.env.MAIL_HOST,

        port: Number(
            process.env.MAIL_PORT || 587
        ),

        secure:
            String(
                process.env.MAIL_SECURE
            ) === "true",

        auth: {

            user:
                process.env.MAIL_USER,

            pass:
                process.env.MAIL_PASSWORD,

        },

    });

}

/*
|--------------------------------------------------------------------------
| Forgot password API
|--------------------------------------------------------------------------
*/

app.post(
    "/api/auth/forgot-password",
    async (req, res) => {

        /*
         * We always return the same response.
         *
         * This prevents attackers from discovering
         * which emails have accounts.
         */

        const genericResponse = {

            success: true,

            message:
                "If an account exists for that email, a password reset link has been sent.",

        };

        try {

            const email =
                normalizeEmail(
                    req.body.email
                );

            if (!isValidEmail(email)) {

                return res.json(
                    genericResponse
                );

            }

            /*
             * Find user.
             */

            const [users] =
                await db.query(
                    `
                    SELECT
                        id,
                        email
                    FROM users
                    WHERE email = ?
                    LIMIT 1
                    `,
                    [email]
                );

            if (users.length === 0) {

                return res.json(
                    genericResponse
                );

            }

            const user =
                users[0];

            /*
             * Generate random reset token.
             */

            const rawToken =
                crypto.randomBytes(32)
                    .toString("hex");

            /*
             * Never store raw token in database.
             */

            const tokenHash =
                hashResetToken(
                    rawToken
                );

            /*
             * Invalidate old unused tokens.
             */

            await db.query(
                `
                UPDATE password_reset_tokens
                SET used_at = NOW()
                WHERE user_id = ?
                  AND used_at IS NULL
                `,
                [user.id]
            );

            /*
             * Token expires after 30 minutes.
             */

            await db.query(
                `
                INSERT INTO password_reset_tokens
                    (
                        user_id,
                        token_hash,
                        expires_at
                    )
                VALUES
                    (
                        ?,
                        ?,
                        DATE_ADD(
                            NOW(),
                            INTERVAL 30 MINUTE
                        )
                    )
                `,
                [
                    user.id,
                    tokenHash,
                ]
            );

            /*
             * Create reset URL.
             */

            const baseUrl =
                process.env.APP_URL ||
                `http://localhost:${PORT}`;

            const resetUrl =
                `${baseUrl}/reset-password.html?token=${rawToken}`;

            /*
             * Send email.
             */

            const transporter =
                createMailTransporter();

            await transporter.sendMail({

                from:
                    process.env.MAIL_FROM ||
                    process.env.MAIL_USER,

                to:
                    user.email,

                subject:
                    "Reset your English Practice password",

                text:
                    `
You requested a password reset.

Open this link within 30 minutes:

${resetUrl}

If you did not request this password reset, you can ignore this email.
                    `,

                html:
                    `
                    <h2>Password Reset</h2>

                    <p>
                        You requested a password reset
                        for your English Sentence Practice account.
                    </p>

                    <p>
                        <a href="${resetUrl}">
                            Reset your password
                        </a>
                    </p>

                    <p>
                        This link expires in 30 minutes.
                    </p>

                    <p>
                        If you did not request this,
                        you can safely ignore this email.
                    </p>
                    `,

            });

            return res.json(
                genericResponse
            );

        } catch (error) {

            console.error(
                "Forgot password error:",
                error
            );

            /*
             * Don't expose internal mail/database
             * errors to the user.
             */

            return res.json(
                genericResponse
            );

        }

    }
);

/*
|--------------------------------------------------------------------------
| RESET PASSWORD
|--------------------------------------------------------------------------
*/

app.post(
    "/api/auth/reset-password",
    async (req, res) => {

        try {

            const {
                token,
                password,
            } = req.body;

            if (
                !token ||
                !isValidPassword(password)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid token or password.",

                });

            }

            /*
             * Hash token before searching DB.
             */

            const tokenHash =
                hashResetToken(
                    token
                );

            /*
             * Find valid token.
             */

            const [tokens] =
                await db.query(
                    `
                    SELECT
                        id,
                        user_id
                    FROM password_reset_tokens
                    WHERE token_hash = ?
                      AND used_at IS NULL
                      AND expires_at > NOW()
                    LIMIT 1
                    `,
                    [tokenHash]
                );

            if (tokens.length === 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This password reset link is invalid or expired.",

                });

            }

            const resetToken =
                tokens[0];

            /*
             * Hash new password.
             */

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );

            /*
             * Update password.
             */

            await db.query(
                `
                UPDATE users
                SET password_hash = ?
                WHERE id = ?
                `,
                [
                    passwordHash,
                    resetToken.user_id,
                ]
            );

            /*
             * Mark token as used.
             */

            await db.query(
                `
                UPDATE password_reset_tokens
                SET used_at = NOW()
                WHERE id = ?
                `,
                [resetToken.id]
            );

            /*
             * Invalidate all other reset tokens
             * for this user as well.
             */

            await db.query(
                `
                UPDATE password_reset_tokens
                SET used_at = NOW()
                WHERE user_id = ?
                  AND used_at IS NULL
                `,
                [resetToken.user_id]
            );

            return res.json({

                success: true,

                message:
                    "Password reset successfully.",

                redirect:
                    "/login.html",

            });

        } catch (error) {

            console.error(
                "Reset password error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to reset password.",

            });

        }

    }
);

/*
|--------------------------------------------------------------------------
| PRACTICE API
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Get words
|--------------------------------------------------------------------------
|
| words.json is READ ONLY.
|
| We never write to this file.
|--------------------------------------------------------------------------
*/

app.get(
    "/api/words",
    requireAuth,
    (req, res) => {

        try {

            const words =
                JSON.parse(
                    fs.readFileSync(
                        WORDS_FILE,
                        "utf8"
                    )
                );

            res.json(words);

        } catch (error) {

            console.error(
                "Words error:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to load words.",

            });

        }

    }
);

/*
|--------------------------------------------------------------------------
| Get current user's progress
|--------------------------------------------------------------------------
*/

app.get(
    "/api/progress",
    requireAuth,
    async (req, res) => {

        try {

            const userId =
                req.user.userId;

            /*
             * Get current index.
             */

            const [progressRows] =
                await db.query(
                    `
                    SELECT
                        current_index
                    FROM user_progress
                    WHERE user_id = ?
                    LIMIT 1
                    `,
                    [userId]
                );

            /*
             * Get practiced words.
             */

            const [wordRows] =
                await db.query(
                    `
                    SELECT
                        word,
                        completed,
                        count,
                        last_practiced AS lastPracticed
                    FROM practiced_words
                    WHERE user_id = ?
                    `,
                    [userId]
                );

            /*
             * Build response in the same
             * structure your existing frontend uses.
             */

            const progress = {

                _meta: {

                    currentIndex:
                        progressRows.length > 0
                            ? progressRows[0].current_index
                            : 0,

                },

            };

            for (
                const row
                of wordRows
            ) {

                progress[row.word] = {

                    completed:
                        Boolean(
                            row.completed
                        ),

                    count:
                        row.count,

                    lastPracticed:
                        row.lastPracticed,

                };

            }

            res.json(progress);

        } catch (error) {

            console.error(
                "Get progress error:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to load progress.",

            });

        }

    }
);

/*
|--------------------------------------------------------------------------
| Save progress
|--------------------------------------------------------------------------
*/

app.post(
    "/api/progress",
    requireAuth,
    async (req, res) => {

        try {

            const userId =
                req.user.userId;

            const {
                word,
                currentIndex,
            } = req.body;

            /*
             * Basic validation.
             */

            if (
                !word ||
                !Number.isInteger(
                    currentIndex
                ) ||
                currentIndex < 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid progress data.",

                });

            }

            /*
             * Save/increment practiced word.
             *
             * If user practices the same word again,
             * count increases.
             */

            await db.query(
                `
                INSERT INTO practiced_words
                    (
                        user_id,
                        word,
                        completed,
                        count,
                        last_practiced
                    )
                VALUES
                    (
                        ?,
                        ?,
                        TRUE,
                        1,
                        NOW()
                    )
                ON DUPLICATE KEY UPDATE

                    completed = TRUE,

                    count = count + 1,

                    last_practiced = NOW()
                `,
                [
                    userId,
                    String(word),
                ]
            );

            /*
             * Save user's current position.
             */

            await db.query(
                `
                INSERT INTO user_progress
                    (
                        user_id,
                        current_index
                    )
                VALUES
                    (
                        ?,
                        ?
                    )
                ON DUPLICATE KEY UPDATE

                    current_index = VALUES(
                        current_index
                    )
                `,
                [
                    userId,
                    currentIndex,
                ]
            );

            res.json({

                success: true,

            });

        } catch (error) {

            console.error(
                "Save progress error:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to save progress.",

            });

        }

    }
);

/*
|--------------------------------------------------------------------------
| Reset current user's progress
|--------------------------------------------------------------------------
*/

app.post(
    "/api/reset",
    requireAuth,
    async (req, res) => {

        try {

            const userId =
                req.user.userId;

            /*
             * Delete all practiced words
             * belonging to this user only.
             */

            await db.query(
                `
                DELETE FROM practiced_words
                WHERE user_id = ?
                `,
                [userId]
            );

            /*
             * Move user back to Word #1.
             */

            await db.query(
                `
                INSERT INTO user_progress
                    (
                        user_id,
                        current_index
                    )
                VALUES
                    (
                        ?,
                        0
                    )
                ON DUPLICATE KEY UPDATE

                    current_index = 0
                `,
                [userId]
            );

            res.json({

                success: true,

            });

        } catch (error) {

            console.error(
                "Reset progress error:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to reset progress.",

            });

        }

    }
);

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

async function startServer() {

    try {

        await initializeDatabase();

        app.listen(
            PORT,
            () => {

                console.log(
                    `🚀 Server running at http://localhost:${PORT}`
                );

                console.log(
                    `🔐 Login: http://localhost:${PORT}/login.html`
                );

            }
        );

    } catch (error) {

        console.error(
            "❌ Failed to start server:",
            error
        );

        process.exit(1);

    }

}

startServer();
