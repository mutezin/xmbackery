const express = require("express");
const cors = require("cors");
const { body, validationResult } = require("express-validator");
const app = express();
const db = require("./db");
require("dotenv").config();

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(cors());
app.use(express.json());

// Express error handler middleware
app.use((err, req, res, next) => {
    console.error('❌ Express Error:', err.message);
    res.status(500).json({ error: err.message });
});

// Health
app.get("/", (req, res) => {
    res.json({ service: "XM Bakery API", status: "ok" });
});

// Create product
app.post(
    "/products",
    body("name").isString().notEmpty(),
    body("price").isFloat({ gt: 0 }),
    body("category").isString().optional(),
    body("quantity").isInt({ min: 0 }),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const { name, price, category = null, quantity } = req.body;
        const q = "INSERT INTO products (name, price, category, quantity) VALUES (?,?,?,?)";
        db.query(q, [name, price, category, quantity], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: result.insertId });
        });
    }
);

// Get products with filtering, sorting, pagination
app.get("/products", (req, res) => {
    const { minPrice, maxPrice, category, minQty, sortBy = "id", order = "ASC", limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    if (minPrice) {
        conditions.push("price >= ?");
        params.push(minPrice);
    }
    if (maxPrice) {
        conditions.push("price <= ?");
        params.push(maxPrice);
    }
    if (category) {
        conditions.push("category = ?");
        params.push(category);
    }
    if (minQty) {
        conditions.push("quantity >= ?");
        params.push(minQty);
    }
    let sql = "SELECT * FROM products";
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    // basic whitelist for sortBy
    const allowedSort = ["id", "price", "quantity", "name"];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : "id";
    const safeOrder = order.toUpperCase() === "DESC" ? "DESC" : "ASC";
    sql += ` ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get single product
app.get("/products/:id", (req, res) => {
    db.query("SELECT * FROM products WHERE id = ?", [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!rows.length) return res.status(404).json({ error: "Not found" });
        res.json(rows[0]);
    });
});

// Update product
app.put("/products/:id", (req, res) => {
    const { name, price, category, quantity } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push("name = ?"); params.push(name); }
    if (price !== undefined) { fields.push("price = ?"); params.push(price); }
    if (category !== undefined) { fields.push("category = ?"); params.push(category); }
    if (quantity !== undefined) { fields.push("quantity = ?"); params.push(quantity); }
    if (!fields.length) return res.status(400).json({ error: "No fields to update" });
    params.push(req.params.id);
    const sql = `UPDATE products SET ${fields.join(", ")} WHERE id = ?`;
    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ affectedRows: result.affectedRows });
    });
});

// Delete product
app.delete("/products/:id", (req, res) => {
    db.query("DELETE FROM products WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ affectedRows: result.affectedRows });
    });
});

// Place an order (transactional)
app.post("/orders", (req, res) => {
    const { customer, items } = req.body; // customer: {name,email,phone}, items: [{product_id, quantity}]
    if (!customer || !Array.isArray(items) || !items.length) return res.status(400).json({ error: "Invalid order" });
    db.getConnection((err, conn) => {
        if (err) return res.status(500).json({ error: err.message });
        conn.beginTransaction(err => {
            if (err) { conn.release(); return res.status(500).json({ error: err.message }); }
            // find or create customer by email
            conn.query("SELECT id FROM customers WHERE email = ?", [customer.email], (e, rows) => {
                if (e) return conn.rollback(() => conn.release() ) && res.status(500).json({ error: e.message });
                const proceedWithCustomer = (customerId) => {
                    // create order
                    conn.query("INSERT INTO orders (customer_id, status, created_at) VALUES (?,?,NOW())", [customerId, 'pending'], (e2, resultOrder) => {
                        if (e2) return conn.rollback(() => conn.release()) && res.status(500).json({ error: e2.message });
                        const orderId = resultOrder.insertId;
                        // insert order items and update inventory
                        const insertItems = items.map(it => [orderId, it.product_id, it.quantity]);
                        conn.query("INSERT INTO order_items (order_id, product_id, quantity) VALUES ?", [insertItems], (e3) => {
                            if (e3) return conn.rollback(() => conn.release()) && res.status(500).json({ error: e3.message });
                            // update product quantities
                            const updatePromises = [];
                            const updateNext = (i) => {
                                if (i >= items.length) {
                                    // create delivery record
                                    conn.query("INSERT INTO deliveries (order_id, status, location) VALUES (?,?,?)", [orderId, 'pending', NULL], (ed) => {
                                        if (ed) return conn.rollback(() => conn.release()) && res.status(500).json({ error: ed.message });
                                        conn.commit(commitErr => {
                                            if (commitErr) return conn.rollback(() => conn.release()) && res.status(500).json({ error: commitErr.message });
                                            conn.release();
                                            return res.json({ orderId });
                                        });
                                    });
                                    return;
                                }
                                const it = items[i];
                                conn.query("UPDATE products SET quantity = quantity - ? WHERE id = ? AND quantity >= ?", [it.quantity, it.product_id, it.quantity], (eu, ru) => {
                                    if (eu) return conn.rollback(() => conn.release()) && res.status(500).json({ error: eu.message });
                                    if (ru.affectedRows === 0) return conn.rollback(() => conn.release()) && res.status(400).json({ error: `Insufficient stock for product ${it.product_id}` });
                                    updateNext(i+1);
                                });
                            };
                            updateNext(0);
                        });
                    });
                };
                if (rows.length) {
                    proceedWithCustomer(rows[0].id);
                } else {
                    conn.query("INSERT INTO customers (name, email, phone) VALUES (?,?,?)", [customer.name, customer.email, customer.phone || null], (ec, rc) => {
                        if (ec) return conn.rollback(() => conn.release()) && res.status(500).json({ error: ec.message });
                        proceedWithCustomer(rc.insertId);
                    });
                }
            });
        });
    });
});

// Get orders for a customer
app.get("/orders/customer/:customerId", (req, res) => {
    const cid = req.params.customerId;
    const sql = `SELECT o.*, oi.product_id, oi.quantity FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE o.customer_id = ? ORDER BY o.created_at DESC`;
    db.query(sql, [cid], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Track delivery for an order
app.get("/orders/:orderId/track", (req, res) => {
    const oid = req.params.orderId;
    const sql = `SELECT d.* FROM deliveries d WHERE d.order_id = ?`;
    db.query(sql, [oid], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!rows.length) return res.status(404).json({ error: 'No delivery found' });
        res.json(rows[0]);
    });
});

// Update delivery (staff)
app.post("/orders/:orderId/track", (req, res) => {
    const oid = req.params.orderId;
    const { status, location } = req.body;
    db.query("UPDATE deliveries SET status = ?, location = ? WHERE order_id = ?", [status, location || null, oid], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ affectedRows: result.affectedRows });
    });
});

// Basic sales report
app.get("/reports/sales", (req, res) => {
    const { from, to } = req.query;
    let sql = `SELECT p.id, p.name, SUM(oi.quantity) as units_sold, SUM(oi.quantity * p.price) as revenue FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id`;
    const params = [];
    if (from || to) {
        sql += ' WHERE o.created_at BETWEEN COALESCE(?, o.created_at) AND COALESCE(?, o.created_at)';
        params.push(from || null, to || null);
    }
    sql += ' GROUP BY p.id, p.name ORDER BY revenue DESC';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`\n✓ XM Bakery API running on http://localhost:${PORT}`);
    console.log(`\nTest the API:`);
    console.log(`  curl http://localhost:${PORT}/`);
    console.log(`  node test.js\n`);
});

server.on('error', (err) => {
    console.error('❌ Server error:', err.message);
});

server.on('close', () => {
    console.log('Server closed');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    server.close(() => process.exit(0));
});