# Smart Estates Management & Decision Support System (DSS)

An advanced, data-driven management platform designed for city-wide estate portfolios. This system provides a unified interface for tracking lease statuses, managing settlements, and analyzing portfolio risk using interactive spatial and predictive analytics.

## 🚀 Key Modules

### 1. Unified Management Dashboard
*   **Asset Condition Map**: Real-time spatial visualization of the entire estate portfolio.
*   **Compliance Scoring**: Instant health check of the total inventory based on legal and financial standing.
*   **Economic Sentiment**: Predictive trend analysis tracking Revenue vs. Default Loss to assist in strategic planning.

### 2. Central Lease Registry
*   Comprehensive searchable database of all active and expired leases.
*   Automated status flagging (RENEWED vs. EXPIRED) for proactive administrative action.

### 3. Settlement & Receipting
*   **Market Entry Receipting**: Digital interface for issuing official city council receipts for rent and arrears.
*   **Live Settlement Log**: Real-time auditing of incoming payments across all urban divisions.

### 4. Risk & Compliance Intelligence
*   **Portfolio Jeopardy Factor**: Data visualizations identifying high-risk segments susceptible to default.
*   **Legal Enforcement List**: Automated identification of critical non-compliant units for targeted intervention.
*   **Honor Roll**: Recognition system for model tenants with consistent compliance history.

### 5. Advanced Analytics
*   **Monthly Summary Matrix**: High-level KPI tracking (Total Billed vs. Collected).
*   **Inventory Health**: Detailed metrics on occupancy rates and utilization trends.

## 🛠 Tech Stack
*   **Frontend**: React.js with Lucide Icons for premium UI aesthetics.
*   **Visualizations**: Chart.js & React-Chartjs-2 for dynamic, animated data representation.
*   **Mapping**: Leaflet.js for interactive GIS-based property tracking.
*   **Data Processing**: JSON-based high-performance data indexing.

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/VincentGumunyu/-smart-estates-dss.git
   ```

2. **Navigate to the dashboard directory:**
   ```bash
   cd dashboard
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

## 🗄️ Database + Login (Supabase)

This project is now ready for:
- PostgreSQL database on **Supabase**
- Email/password login via **Supabase Auth**

1. Create a Supabase project.
2. Run `db/schema.sql` in Supabase SQL editor.
3. In `dashboard/.env.local`, set:
   ```bash
   VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```
4. Create dashboard users in Supabase Auth (Email provider).
5. Import Excel data:
   ```bash
   pip install -r requirements-data.txt
   set SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   python scripts/import_excel_to_supabase.py
   ```
6. Create/refresh demo login user:
   ```bash
   set DEMO_EMAIL=demo@smartestates.local
   set DEMO_PASSWORD=ChangeMe123!
   python scripts/create_demo_login.py
   ```

When Supabase env vars are present, the app shows a login page and reads data from `public.tuckshops`.
If not configured, it falls back to local JSON.

### Name-normalized reporting views

`db/schema.sql` now includes:
- `public.v_tuckshops_by_lessee_name` (grouped summary in master table)
- `public.v_tuckshops_combined_by_lessee_name` (combined summary across main + Book2)

These keep raw rows intact while enabling clean grouped reports by normalized lessee name.

## ☁️ Deploy (Fly.io — dashboard + API together)

One Docker image builds the **Vite** app and serves it with **FastAPI** (`/api/*` for the AI API, everything else the SPA).

```powershell
# https://fly.io/docs/hands-on/install-flyctl/
fly auth login
cd path\to\-smart-estates-dss-main
fly launch
fly secrets set OPENAI_API_KEY=sk-your-key
fly deploy
```

Open `https://<your-app>.fly.dev` — same host for UI and `/api`. Health check: `/api/health`.

**Local dev:** still use `npm run dev` in `dashboard/` (Vite proxies `/api` → `localhost:8765`) and `python ai_api.py` in the repo root.

**Custom domain on Fly:** add it in the Fly dashboard; CORS is only needed for split dev (localhost), unless you set `CORS_ALLOW_ORIGIN_REGEX`.

---
*Developed for advanced urban estate management and strategic decision support.*
