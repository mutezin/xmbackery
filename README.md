# XM Bakery — Node.js + MySQL backend

Minimal backend API for XM Bakeries to manage products, orders, delivery tracking and reports.

Setup

1. Install dependencies

```powershell
npm install
```

2. Create the database and tables

Run the SQL in `schema.sql` against your MySQL instance (for example using `mysql` CLI or a GUI tool).

```powershell
mysql -u root -p < schema.sql
```

3. Create `.env` from `.env.example` and set DB credentials.

4. Run the app

```powershell
npm run dev   # or npm start
```

Endpoints (examples)

- List products with filters:

```powershell
curl "http://localhost:5000/products?minPrice=0.5&maxPrice=2&category=bread&limit=20"
```

- Create product:

```powershell
curl -X POST http://localhost:5000/products -H "Content-Type: application/json" -d "{ \"name\": \"Bagel\", \"price\": 0.6, \"category\": \"bread\", \"quantity\": 50 }"
```

- Place order:

```powershell
curl -X POST http://localhost:5000/orders -H "Content-Type: application/json" -d "{
  \"customer\": { \"name\": \"Alice\", \"email\": \"alice@example.com\" },
  \"items\": [{ \"product_id\": 1, \"quantity\": 2 }, { \"product_id\": 2, \"quantity\": 1 }]
}"
```

Notes & next steps

- Add authentication (JWT) middleware for protected endpoints.
- Configure Firebase Functions or Hosting for deployment (I can scaffold `firebase.json` and Functions setup if you want).
- Add frontend or mobile client for customer ordering and delivery tracking.
