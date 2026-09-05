const { createClient } = window.supabase;

const db = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

const $ = id => document.getElementById(id);


/* =========================================================
   GLOBAL STATE
========================================================= */

let code = "";
let pin = "";
let worker = null;
let busy = false;

let adminInventoryView = "consolidated";
let adminInventoryCategory = "all";
let adminInventoryData = [];


/* =========================================================
   HELPERS
========================================================= */

function isAdmin() {
  return (
    worker &&
    String(worker.role || "").toLowerCase() === "admin"
  );
}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function showError(target, error) {

  if (!target) return;

  target.innerHTML = `
    <p style="color:#c93636;padding:15px">
      ${escapeHtml(error?.message || error || "Something went wrong.")}
    </p>
  `;
}


async function refreshAll() {

  try {

    if (isAdmin()) {

      await loadAdminInventory();

    } else {

      await loadWorkerInventory();

    }


    /*
     * Refresh summary/dashboard data too
     */

    if (typeof loadSummary === "function") {

      await loadSummary();

    }


  } catch (e) {

    console.error("Refresh error:", e);

  }

}


/* =========================================================
   BROWSER BACK BUTTON
========================================================= */

function pushAppState() {

  history.pushState(
    { jmp: 1 },
    "",
    location.href
  );

}


pushAppState();


window.addEventListener("popstate", () => {

  const modals =
    document.querySelectorAll(".modal");

  if (modals.length) {

    modals[modals.length - 1].remove();

    busy = false;

  }

  pushAppState();

});


/* =========================================================
   LOGIN
========================================================= */

if ($("signIn")) {
  $("signIn").onclick = login;
}


if ($("pin")) {

  $("pin").onkeydown = e => {

    if (e.key === "Enter") {
      login();
    }

  };

}


if ($("accessCode")) {

  $("accessCode").onkeydown = e => {

    if (e.key === "Enter") {

      $("pin")?.focus();

    }

  };

}


/* =========================================================
   LOGOUT
========================================================= */

if ($("logout")) {

  $("logout").onclick = () => {

    localStorage.removeItem("jmp_worker");

    location.reload();

  };

}


/* =========================================================
   LOGIN FUNCTION
========================================================= */

async function login() {

  code =
    $("accessCode")?.value.trim() || "";

  pin =
    $("pin")?.value.trim() || "";


  if (!code || !pin) {

    $("loginMsg").textContent =
      "Enter access code and password.";

    return;

  }


  const button = $("signIn");

  button.disabled = true;

  $("loginMsg").textContent =
    "Checking...";


  try {

    const { data, error } =
      await db.rpc(
        "worker_login",
        {
          p_access_code: code,
          p_pin: pin
        }
      );


    if (error) throw error;


    if (!data?.length) {

      $("loginMsg").textContent =
        "Incorrect access code or password.";

      return;

    }


    worker = data[0];


    localStorage.setItem(
      "jmp_worker",
      JSON.stringify(worker)
    );


    if ($("welcome")) {

      $("welcome").textContent =
        "Signed in as " +
        worker.worker_name;

    }


    $("loginScreen")
      ?.classList.add("hidden");

    $("homeScreen")
      ?.classList.remove("hidden");


    /* ADMIN VIEW */

    if (isAdmin()) {

      $("adminActions")
        ?.classList.remove("hidden");

      $("workerInventoryPanel")
        ?.classList.add("hidden");

      $("adminInventoryPanel")
        ?.classList.add("hidden");

    }


    /* WORKER VIEW */

    else {

      $("workerInventoryPanel")
        ?.classList.remove("hidden");

    }


    await loadSummary();


    if (!isAdmin()) {

      await loadWorkerInventory();

    }


  } catch (e) {

    console.error(e);

    $("loginMsg").textContent =
      e.message || "Login error.";

  }


  finally {

    button.disabled = false;

  }

}


/* =========================================================
   WORKER INVENTORY
========================================================= */

async function getWorkerProducts() {

  const { data, error } =
    await db.rpc(
      "worker_inventory",
      {
        p_access_code: code,
        p_pin: pin
      }
    );


  if (error) throw error;


  return data || [];

}


async function loadWorkerInventory() {

  const list =
    $("inventoryList");


  if (!list) return;


  list.innerHTML =
    "Loading inventory...";


  try {

    const data =
      await getWorkerProducts();


    if (!data.length) {

      list.innerHTML =
        "<p>No products found.</p>";

      return;

    }


    list.innerHTML =
      data.map(p => {

        const stock =
          Number(p.current_stock || 0);

        const threshold =
          Number(p.threshold || 0);

        const low =
          stock <= threshold;


        return `

          <div class="item">

            <div>

              <b>
                ${escapeHtml(p.name)}
              </b>

              <small>
                Minimum: ${threshold}
              </small>

            </div>


            <strong class="qty">

              ${stock}

              <span
                class="badge ${low ? "low" : ""}">

                ${low ? "LOW" : "OK"}

              </span>

            </strong>

          </div>

        `;

      }).join("");


  } catch (e) {

    console.error(e);

    showError(list, e);

  }

}


/* OLD COMPATIBILITY FUNCTION */

async function loadInventory() {

  if (isAdmin()) {

    const panel =
      $("adminInventoryPanel");

    if (
      panel &&
      !panel.classList.contains("hidden")
    ) {

      return loadAdminInventory();

    }

    return;

  }


  return loadWorkerInventory();

}


/* =========================================================
   STOCK SUMMARY
========================================================= */

async function loadSummary() {

  if (!worker) return;


  try {

    const { data, error } =
      await db.rpc(
        "worker_stock_summary",
        {
          p_access_code: code,
          p_pin: pin
        }
      );


    if (error) {

      console.warn(
        "Summary error:",
        error.message
      );

      return;

    }


    let element =
      $("summaryList");


    if (!element) return;


    element.innerHTML =
      (data || []).map(p => `

        <div class="item">

          <div>

            <b>
              ${escapeHtml(p.product_name)}
            </b>

            <small>

              IN: ${p.stock_in}
              &nbsp;
              OUT: ${p.stock_out}

            </small>

          </div>


          <strong class="qty">

            ${p.net_stock}

          </strong>

        </div>

      `).join("");


  } catch (e) {

    console.warn(
      "Summary error:",
      e.message
    );

  }

}


/* =========================================================
   STOCK IN / STOCK OUT
========================================================= */

async function move(type) {

  if (busy || !worker) return;


  busy = true;


  try {

    const data =
      await getWorkerProducts();


    if (!data.length) {

      alert("No products available.");

      busy = false;

      return;

    }


    const modal =
      document.createElement("div");


    modal.className =
      "modal";


    modal.innerHTML = `

      <div class="modalbox">

        <h2>
          Stock ${type}
        </h2>


        <p>
          Select product:
        </p>


        <div id="productChoices">

          ${data.map(p => `

            <button
              class="product"
              type="button"
              data-id="${p.product_id}"
              data-stock="${Number(p.current_stock || 0)}">

              <b>
                ${escapeHtml(p.name)}
              </b>

              <small>

                Current Stock:
                ${Number(p.current_stock || 0)}

              </small>

            </button>

          `).join("")}

        </div>


        <button
          id="cancelMove"
          class="cancel"
          type="button">

          Close

        </button>

      </div>

    `;


    document.body.appendChild(modal);


    modal.querySelector("#cancelMove")
      .onclick = () => {

        modal.remove();

        busy = false;

      };


    modal
      .querySelectorAll(".product")
      .forEach(button => {


        button.onclick = () => {

          const productId =
            Number(button.dataset.id);

          const stock =
            Number(button.dataset.stock);


          modal.innerHTML = `

            <div class="modalbox">

              <h2>
                Stock ${type}
              </h2>


              <p>

                <b>
                  ${escapeHtml(
                    button.querySelector("b")
                      ?.textContent
                  )}
                </b>

              </p>


              <input
                id="qty"
                type="number"
                min="1"
                placeholder="Enter quantity">


              <p id="stockMsg"></p>


              <button
                id="saveQty"
                class="save"
                type="button">

                Save Stock ${type}

              </button>


              <button
                id="cancelQty"
                class="cancel"
                type="button">

                Back

              </button>

            </div>

          `;


          modal
            .querySelector("#cancelQty")
            .onclick = () => {

              modal.remove();

              busy = false;

              move(type);

            };


          modal
            .querySelector("#saveQty")
            .onclick = async () => {


              const quantity =
                Number(
                  modal.querySelector("#qty").value
                );


              if (
                !Number.isInteger(quantity) ||
                quantity < 1
              ) {

                modal.querySelector("#stockMsg")
                  .textContent =
                  "Enter a valid quantity.";

                return;

              }


              if (
                type === "OUT" &&
                quantity > stock
              ) {

                modal.querySelector("#stockMsg")
                  .textContent =
                  "Insufficient stock.";

                return;

              }


              if (!confirm(

                `Save Stock ${type} of ${quantity}?`

              )) return;


              const saveButton =
                modal.querySelector("#saveQty");


              saveButton.disabled = true;


              modal.querySelector("#stockMsg")
                .textContent =
                "Saving...";


              try {

                const { error } =
                  await db.rpc(

                    type === "IN"
                      ? "stock_in"
                      : "stock_out",

                    {
                      p_product_id: productId,
                      p_user_id: worker.user_id,
                      p_quantity: quantity
                    }

                  );


                if (error) throw error;


                modal.remove();

                busy = false;


                /* CRITICAL REFRESH */

                await refreshAll();


                alert(
                  `Stock ${type} saved successfully.`
                );


              } catch (e) {

                saveButton.disabled = false;

                modal.querySelector("#stockMsg")
                  .textContent =
                  e.message;

              }

            };

        };

      });


  } catch (e) {

    console.error(e);

    alert(e.message);

    busy = false;

  }

}


if ($("stockIn")) {

  $("stockIn").onclick =
    () => move("IN");

}


if ($("stockOut")) {

  $("stockOut").onclick =
    () => move("OUT");

}


/* =========================================================
   ADMIN INVENTORY
========================================================= */

async function openAdminInventory() {

  if (!isAdmin()) return;


  const dashboard =
    $("dashboard");

  const adminPanel =
    $("adminInventoryPanel");


  if (!adminPanel) {

    alert(
      "Admin Inventory panel not found."
    );

    return;

  }


  /* Hide dashboard */

  if (dashboard) {

    dashboard.classList.add("hidden");

  }


  $("workerInventoryPanel")
    ?.classList.add("hidden");


  /* Show inventory */

  adminPanel
    .classList.remove("hidden");


  /* Reset */

  adminInventoryView =
    "consolidated";

  adminInventoryCategory =
    "all";


  const search =
    $("adminProductSearch");

  if (search) {

    search.value = "";

  }


  document
    .querySelectorAll(".stock-tab")
    .forEach(tab => {

      tab.classList.toggle(
        "active",
        tab.dataset.stockView ===
        "consolidated"
      );

    });


  await loadAdminInventory();

}


async function closeAdminInventory() {

  $("adminInventoryPanel")
    ?.classList.add("hidden");


  $("dashboard")
    ?.classList.remove("hidden");

}


/* =========================================================
   LOAD ADMIN INVENTORY
========================================================= */

async function loadAdminInventory() {

  const list =
    $("adminInventoryList");


  if (!list) return;


  list.innerHTML =
    "Loading inventory...";


  try {

    /*
      IMPORTANT:

      Your current SQL test showed
      admin_inventory_by_location
      returning:

      product_id
      product_name
      category_id
      category_name
      unit
      threshold
      kumar_stock
      office_stock
      consolidated_stock

      Therefore NO parameters are passed.
    */


    const { data, error } =
      await db.rpc(
        "admin_inventory_by_location"
      );


    if (error) throw error;


    adminInventoryData =
      data || [];


    renderAdminCategoryTabs();


    renderAdminInventoryList();


  } catch (e) {

    console.error(
      "Admin inventory error:",
      e
    );


    showError(list, e);

  }

}


/* =========================================================
   CATEGORY TABS
========================================================= */

function renderAdminCategoryTabs() {

  const container =
    $("adminCategoryTabs");


  if (!container) return;


  const categories =
    [...new Map(

      adminInventoryData
        .filter(x => x.category_name)
        .map(x => [

          String(
            x.category_id ||
            x.category_name
          ),

          {
            id:
              x.category_id ||
              x.category_name,

            name:
              x.category_name
          }

        ])

    ).values()]


      .sort(
        (a, b) =>
          String(a.name)
            .localeCompare(String(b.name))
      );


  container.innerHTML = `

    <button
      class="category-tab ${adminInventoryCategory === "all" ? "active" : ""}"
      data-category="all"
      type="button">

      All

    </button>


    ${categories.map(category => `

      <button
        class="category-tab
        ${String(adminInventoryCategory) === String(category.id)
          ? "active"
          : ""}"

        data-category="${escapeHtml(category.id)}"

        type="button">

        ${escapeHtml(category.name)}

      </button>

    `).join("")}

  `;


  container
    .querySelectorAll(".category-tab")
    .forEach(button => {

      button.onclick = () => {

        adminInventoryCategory =
          button.dataset.category;

        renderAdminCategoryTabs();

        renderAdminInventoryList();

      };

    });

}


/* =========================================================
   RENDER ADMIN INVENTORY
========================================================= */

function renderAdminInventoryList() {

  const list =
    $("adminInventoryList");


  if (!list) return;


  const search =
    String(
      $("adminProductSearch")
        ?.value || ""
    )
      .trim()
      .toLowerCase();


  let rows =
    [...adminInventoryData];


  /* CATEGORY FILTER */

  if (
    adminInventoryCategory !== "all"
  ) {

    rows =
      rows.filter(row =>

        String(
          row.category_id ||
          row.category_name
        ) ===
        String(adminInventoryCategory)

      );

  }


  /* SEARCH FILTER */

  if (search) {

    rows =
      rows.filter(row =>

        String(row.product_name || "")
          .toLowerCase()
          .includes(search)

      );

  }


  /* SORT BY CATEGORY THEN PRODUCT */

  rows.sort((a, b) => {

    const categoryCompare =
      String(a.category_name || "")
        .localeCompare(
          String(b.category_name || "")
        );


    if (categoryCompare !== 0) {

      return categoryCompare;

    }


    return String(a.product_name || "")
      .localeCompare(
        String(b.product_name || "")
      );

  });


  if (!rows.length) {

    list.innerHTML = `

      <p style="padding:20px;text-align:center">

        No products found.

      </p>

    `;

    return;

  }


  const stockField =

    adminInventoryView === "kumar"
      ? "kumar_stock"

      : adminInventoryView === "office"
        ? "office_stock"

        : "consolidated_stock";


  list.innerHTML =
    rows.map(row => {


      const quantity =
        Number(
          row[stockField] || 0
        );


      const threshold =
        Number(
          row.threshold || 0
        );


      const low =
        quantity <= threshold;


      return `

        <div class="item">

          <div>

            <b>

              ${escapeHtml(
                row.product_name
              )}

            </b>


            <small>

              ${escapeHtml(
                row.category_name || "Uncategorized"
              )}

              ·

              Min:
              ${threshold}

              ${row.unit
                ? " " +
                  escapeHtml(row.unit)
                : ""
              }

            </small>

          </div>


          <strong class="qty">

            ${quantity}

            ${row.unit
              ? `<small>${escapeHtml(row.unit)}</small>`
              : ""
            }


            <span
              class="badge
              ${low ? "low" : ""}">

              ${low ? "LOW" : "OK"}

            </span>

          </strong>

        </div>

      `;

    }).join("");

}


/* =========================================================
   INVENTORY BUTTON
========================================================= */

if ($("inventory")) {

  $("inventory").onclick =
    async () => {

      if (isAdmin()) {

        await openAdminInventory();

      } else {

        $("workerInventoryPanel")
          ?.classList.remove("hidden");

        await loadWorkerInventory();

      }

    };

}


/* =========================================================
   BACK TO DASHBOARD
========================================================= */

if ($("backToDashboard")) {

  $("backToDashboard").onclick =
    closeAdminInventory;

}


/* =========================================================
   STOCK VIEW TABS
========================================================= */

document
  .querySelectorAll(".stock-tab")
  .forEach(tab => {

    tab.onclick = () => {

      adminInventoryView =
        tab.dataset.stockView;


      document
        .querySelectorAll(".stock-tab")
        .forEach(item => {

          item.classList.toggle(
            "active",
            item === tab
          );

        });


      renderAdminInventoryList();

    };

  });


/* =========================================================
   INVENTORY SEARCH
========================================================= */

if ($("adminProductSearch")) {

  $("adminProductSearch")
    .addEventListener(
      "input",
      renderAdminInventoryList
    );

}


/* =========================================================
   ADMIN MODAL
========================================================= */

function adminBox(title, body) {

  const modal =
    document.createElement("div");


  modal.className =
    "modal";


  modal.innerHTML = `

    <div class="modalbox">

      <h2>
        ${title}
      </h2>


      ${body}


      <button
        class="cancel adminClose"
        type="button">

        Close

      </button>

    </div>

  `;


  document.body
    .appendChild(modal);


  modal
    .querySelector(".adminClose")
    .onclick = () => {

      modal.remove();

      busy = false;

    };


  return modal;

}


/* =========================================================
   ADMIN CATEGORIES
========================================================= */

async function adminCategories() {

  try {

    const { data, error } =
      await db.rpc(
        "admin_categories",
        {
          p_code: code,
          p_pin: pin
        }
      );


    if (error) throw error;


    const modal =
      adminBox(

        "Categories",

        `

        <input
          id="newCat"
          placeholder="New category name">


        <button
          id="addCat"
          class="save"
          type="button">

          Add Category

        </button>


        <div style="margin-top:15px">

          ${(data || []).map(x => `

            <div class="item">

              <div>

                <b>
                  ${escapeHtml(x.name)}
                </b>

                <small>

                  ${x.active
                    ? "Active"
                    : "Inactive"}

                </small>

              </div>

            </div>

          `).join("")}

        </div>

        `

      );


    modal
      .querySelector("#addCat")
      .onclick = async () => {


        const name =
          modal
            .querySelector("#newCat")
            .value
            .trim();


        if (!name) {

          alert(
            "Enter category name."
          );

          return;

        }


        const { error } =
          await db.rpc(
            "admin_add_category",
            {
              p_code: code,
              p_pin: pin,
              p_name: name
            }
          );


        if (error) {

          alert(error.message);

          return;

        }


        modal.remove();


        await adminCategories();


        /* REFRESH INVENTORY */

        await refreshAll();

      };


  } catch (e) {

    alert(e.message);

  }

}


/* =========================================================
   ADMIN PRODUCTS
========================================================= */

async function adminProducts() {

  try {

    const productsResult =
      await db.rpc(
        "admin_products",
        {
          p_code: code,
          p_pin: pin
        }
      );


    if (productsResult.error)
      throw productsResult.error;


    const categoriesResult =
      await db.rpc(
        "admin_categories",
        {
          p_code: code,
          p_pin: pin
        }
      );


    if (categoriesResult.error)
      throw categoriesResult.error;


    const products =
      productsResult.data || [];


    const categories =
      categoriesResult.data || [];


    const categoryOptions =
      categories
        .filter(x => x.active)
        .map(x => `

          <option value="${x.id}">

            ${escapeHtml(x.name)}

          </option>

        `)
        .join("");


    const modal =
      adminBox(

        "Products",

        `

        <button
          id="addProduct"
          class="save"
          type="button">

          + Add Product

        </button>


        <div style="margin-top:15px">

          ${products.map(product => `

            <div class="item">

              <div>

                <b>
                  ${escapeHtml(product.name)}
                </b>


                <small>

                  ${escapeHtml(
                    product.category_name ||
                    "No category"
                  )}

                  · Threshold:
                  ${product.threshold ?? 0}

                </small>

              </div>


              <button
                class="editProduct"
                data-id="${product.id}"
                type="button">

                Edit

              </button>

            </div>

          `).join("")}

        </div>

        `

      );


    modal
      .querySelector("#addProduct")
      .onclick = () => {

        modal.remove();

        addProductForm(
          categoryOptions
        );

      };


    modal
      .querySelectorAll(".editProduct")
      .forEach(button => {

        button.onclick = () => {

          modal.remove();

          editProduct(
            button.dataset.id,
            products,
            categoryOptions
          );

        };

      });


  } catch (e) {

    alert(e.message);

  }

}


/* =========================================================
   ADD PRODUCT
========================================================= */

function addProductForm(categoryOptions) {

  const modal =
    adminBox(

      "Add Product",

      `

      <input
        id="pn"
        placeholder="Product name">


      <select id="pc">

        <option value="">
          Select category
        </option>

        ${categoryOptions}

      </select>


      <input
        id="po"
        type="number"
        min="0"
        value="0"
        placeholder="Opening stock">


      <input
        id="pt"
        type="number"
        min="0"
        value="0"
        placeholder="Minimum stock threshold">


      <button
        id="saveP"
        class="save"
        type="button">

        Save Product

      </button>

      `

    );


  modal
    .querySelector("#saveP")
    .onclick = async () => {


      const name =
        modal.querySelector("#pn")
          .value.trim();


      const opening =
        Number(
          modal.querySelector("#po")
            .value || 0
        );


      const threshold =
        Number(
          modal.querySelector("#pt")
            .value || 0
        );


      const category =
        modal.querySelector("#pc")
          .value;


      if (!name) {

        alert(
          "Enter product name."
        );

        return;

      }


      if (
        opening < 0 ||
        threshold < 0
      ) {

        alert(
          "Values cannot be negative."
        );

        return;

      }


      const saveButton =
        modal.querySelector("#saveP");


      saveButton.disabled = true;

      saveButton.textContent =
        "Saving...";


      const { error } =
        await db.rpc(
          "admin_add_product",
          {
            p_code: code,
            p_pin: pin,
            p_name: name,
            p_category_id:
              category
                ? Number(category)
                : null,
            p_opening: opening,
            p_threshold: threshold
          }
        );


      if (error) {

        saveButton.disabled = false;

        saveButton.textContent =
          "Save Product";

        alert(error.message);

        return;

      }


      modal.remove();


      await refreshAll();


      alert(
        "Product added successfully."
      );

    };

}


/* =========================================================
   EDIT PRODUCT
========================================================= */

async function editProduct(
  id,
  products,
  categoryOptions
) {

  const product =
    products.find(
      x =>
        String(x.id) ===
        String(id)
    );


  if (!product) {

    alert("Product not found.");

    return;

  }


  const modal =
    adminBox(

      "Edit Product",

      `

      <input
        id="en"
        value="${escapeHtml(product.name)}">


      <select id="ec">

        <option value="">
          No category
        </option>

        ${categoryOptions}

      </select>


      <input
        id="et"
        type="number"
        min="0"
        value="${Number(product.threshold || 0)}">


      <select id="ea">

        <option value="true">
          Active
        </option>

        <option value="false">
          Inactive
        </option>

      </select>


      <button
        id="saveE"
        class="save"
        type="button">

        Save Changes

      </button>

      `

    );


  if (product.category_id) {

    modal.querySelector("#ec").value =
      product.category_id;

  }


  modal.querySelector("#ea").value =
    String(product.active);


  modal
    .querySelector("#saveE")
    .onclick = async () => {


      const name =
        modal.querySelector("#en")
          .value.trim();


      const threshold =
        Number(
          modal.querySelector("#et")
            .value || 0
        );


      if (!name) {

        alert(
          "Product name required."
        );

        return;

      }


      const saveButton =
        modal.querySelector("#saveE");


      saveButton.disabled = true;


      const { error } =
        await db.rpc(
          "admin_edit_product",
          {
            p_code: code,
            p_pin: pin,
            p_id: Number(id),
            p_name: name,
            p_category_id:
              modal.querySelector("#ec").value
                ? Number(
                    modal.querySelector("#ec").value
                  )
                : null,
            p_threshold: threshold,
            p_active:
              modal.querySelector("#ea").value
              === "true"
          }
        );


      if (error) {

        saveButton.disabled = false;

        alert(error.message);

        return;

      }


      modal.remove();


      await refreshAll();


      alert(
        "Product updated successfully."
      );

    };

}


/* =========================================================
   ADMIN TRANSACTIONS
========================================================= */

async function adminTransactions() {

  try {

    const { data, error } =
      await db.rpc(
        "admin_transactions",
        {
          p_code: code,
          p_pin: pin
        }
      );


    if (error) throw error;


    const modal =
      adminBox(

        "Transactions",

        `

        <div class="transaction-list">

          ${(data || []).map(x => `

            <div class="item">

              <div>

                <b>
                  ${escapeHtml(
                    x.product_name
                  )}
                </b>


                <small>

                  ${escapeHtml(x.movement)}
                  · Qty ${x.quantity}

                  <br>

                  ${x.created_at
                    ? new Date(
                        x.created_at
                      ).toLocaleString()
                    : ""
                  }

                </small>

              </div>


              <button
                class="editTx"
                data-id="${x.id}"
                type="button">

                Correct

              </button>

            </div>

          `).join("")}

        </div>

        `

      );


    modal
      .querySelectorAll(".editTx")
      .forEach(button => {

        button.onclick = () =>
          correctTransaction(
            button.dataset.id,
            data || []
          );

      });


  } catch (e) {

    alert(e.message);

  }

}


/* =========================================================
   CORRECT TRANSACTION
========================================================= */

async function correctTransaction(
  id,
  transactions
) {

  const transaction =
    transactions.find(
      x =>
        String(x.id) ===
        String(id)
    );


  if (!transaction) {

    alert(
      "Transaction not found."
    );

    return;

  }


  const modal =
    adminBox(

      "Correct Transaction",

      `

      <p>

        <b>
          ${escapeHtml(
            transaction.product_name
          )}
        </b>

      </p>


      <select id="txMovement">

        <option value="IN">
          IN
        </option>

        <option value="OUT">
          OUT
        </option>

      </select>


      <input
        id="txQuantity"
        type="number"
        min="1"
        value="${Number(
          transaction.quantity || 1
        )}">


      <button
        id="saveTx"
        class="save"
        type="button">

        Save Correction

      </button>

      `

    );


  modal.querySelector("#txMovement").value =
    transaction.movement;


  modal
    .querySelector("#saveTx")
    .onclick = async () => {


      const movement =
        modal.querySelector("#txMovement")
          .value;


      const quantity =
        Number(
          modal.querySelector("#txQuantity")
            .value
        );


      if (
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {

        alert(
          "Enter valid quantity."
        );

        return;

      }


      const { error } =
        await db.rpc(
          "admin_correct_transaction",
          {
            p_code: code,
            p_pin: pin,
            p_id: Number(id),
            p_movement: movement,
            p_quantity: quantity
          }
        );


      if (error) {

        alert(error.message);

        return;

      }


      modal.remove();


      await refreshAll();


      alert(
        "Transaction corrected successfully."
      );

    };

}


/* =========================================================
   ADMIN WORKERS
========================================================= */

async function adminWorkers() {

  try {

    const { data, error } =
      await db.rpc(
        "admin_workers",
        {
          p_code: code,
          p_pin: pin
        }
      );


    if (error) throw error;


    const modal =
      adminBox(

        "Workers",

        `

        <div>

          ${(data || []).map(x => `

            <div class="item">

              <div>

                <b>
                  ${escapeHtml(
                    x.name ||
                    x.worker_name ||
                    ""
                  )}
                </b>


                <small>

                  ${escapeHtml(
                    x.access_code || ""
                  )}

                  ·

                  ${x.active
                    ? "Active"
                    : "Inactive"}

                </small>

              </div>

            </div>

          `).join("")}

        </div>

        `

      );


  } catch (e) {

    alert(e.message);

  }

}


/* =========================================================
   PASTE STOCK UPDATE
========================================================= */

async function pasteStockUpdate() {

  if (!isAdmin()) return;


  let workers = [];
  let products = [];


  try {

    const workerResult =
      await db.rpc(
        "admin_workers",
        {
          p_code: code,
          p_pin: pin
        }
      );


    if (workerResult.error)
      throw workerResult.error;


    workers =
      workerResult.data || [];


    const productResult =
      await db.rpc(
        "admin_products",
        {
          p_code: code,
          p_pin: pin
        }
      );


    if (productResult.error)
      throw productResult.error;


    products =
      productResult.data || [];


  } catch (e) {

    alert(e.message);

    return;

  }


  const modal =
    adminBox(

      "📋 Paste Stock Update",

      `

      <p>

        Paste the complete stock message below.

      </p>


      <textarea
        id="stockPasteText"
        rows="10"
        placeholder="Paste worker stock message here..."></textarea>


      <button
        id="previewStockPaste"
        class="save"
        type="button">

        Preview

      </button>


      <div id="stockPastePreview"></div>

      `

    );


  modal
    .querySelector("#previewStockPaste")
    .onclick = async () => {


      const message =
        modal
          .querySelector("#stockPasteText")
          .value
          .trim();


      if (!message) {

        alert(
          "Paste the stock message first."
        );

        return;

      }


      const previewButton =
        modal.querySelector(
          "#previewStockPaste"
        );


      previewButton.disabled = true;

      previewButton.textContent =
        "Reading...";


      try {

        const { data, error } =
          await db.rpc(
            "preview_whatsapp_stock",
            {
              p_message: message
            }
          );


        if (error) throw error;


        const items =
          Array.isArray(data)
            ? data
            : [];


        if (!items.length) {

          throw new Error(
            "No stock items could be read."
          );

        }


        const preview =
          modal.querySelector(
            "#stockPastePreview"
          );


        preview.innerHTML = `

          <hr style="margin:20px 0">


          <label>

            Worker

          </label>


          <select id="stockWorker">

            <option value="">
              Select worker
            </option>


            ${workers.map(x => `

              <option value="${x.id || x.user_id}">

                ${escapeHtml(
                  x.name ||
                  x.worker_name ||
                  x.access_code ||
                  ""
                )}

              </option>

            `).join("")}

          </select>


          <div style="margin-top:15px">

            ${items.map((x, index) => {

              const matched =
                String(
                  x.match_status || ""
                ).toLowerCase() ===
                "matched";


              return `

                <div
                  class="item"
                  style="display:block">

                  <b>

                    ${escapeHtml(
                      x.product_name ||
                      x.message_product ||
                      "Unknown product"
                    )}

                  </b>


                  <small>

                    Quantity:
                    ${x.quantity || 0}

                    ${escapeHtml(
                      x.product_unit ||
                      x.message_unit ||
                      ""
                    )}

                  </small>


                  ${!matched ? `

                    <select
                      class="stockProductChoice"
                      data-index="${index}">

                      <option value="">
                        Select correct product
                      </option>


                      ${products
                        .filter(
                          p => p.active !== false
                        )
                        .map(p => `

                          <option value="${p.id}">

                            ${escapeHtml(p.name)}

                          </option>

                        `)
                        .join("")}

                    </select>

                  ` : ""}

                </div>

              `;

            }).join("")}

          </div>


          <button
            id="confirmStockPaste"
            class="save"
            type="button">

            Confirm & Update Stock

          </button>


          <p id="stockPasteMsg"></p>

        `;


        modal
          .querySelector("#confirmStockPaste")
          .onclick = async () => {


            const workerId =
              Number(
                modal.querySelector(
                  "#stockWorker"
                ).value
              );


            if (!workerId) {

              alert(
                "Select the worker."
              );

              return;

            }


            const finalItems = [];


            for (
              let i = 0;
              i < items.length;
              i++
            ) {

              const item =
                items[i];


              let productId =
                Number(
                  item.product_id
                );


              if (

                String(
                  item.match_status || ""
                ).toLowerCase()
                !== "matched"

              ) {

                const choice =
                  modal.querySelector(

                    `.stockProductChoice[data-index="${i}"]`

                  );


                if (
                  !choice ||
                  !choice.value
                ) {

                  alert(
                    "Please confirm every uncertain product."
                  );

                  return;

                }


                productId =
                  Number(choice.value);

              }


              if (

                !productId ||

                !Number.isInteger(
                  Number(item.quantity)
                )

              ) {

                alert(
                  "Invalid product or quantity."
                );

                return;

              }


              finalItems.push({

                product_id:
                  productId,

                quantity:
                  Number(item.quantity),

                unit:
                  item.product_unit ||
                  item.message_unit ||
                  ""

              });

            }


            const confirmButton =
              modal.querySelector(
                "#confirmStockPaste"
              );


            const messageBox =
              modal.querySelector(
                "#stockPasteMsg"
              );


            confirmButton.disabled =
              true;


            confirmButton.textContent =
              "Updating...";


            messageBox.textContent =
              "Updating physical stock...";


            try {

              const { error } =
                await db.rpc(
                  "confirm_whatsapp_stock_update",
                  {
                    p_code: code,
                    p_pin: pin,
                    p_worker_id: workerId,
                    p_raw_message: message,
                    p_items: finalItems
                  }
                );


              if (error) throw error;


              modal.remove();


              await refreshAll();


              alert(
                "Stock update saved successfully."
              );


            } catch (e) {

              confirmButton.disabled =
                false;


              confirmButton.textContent =
                "Confirm & Update Stock";


              messageBox.textContent =
                e.message;

            }

          };


      } catch (e) {

        alert(e.message);


        previewButton.disabled =
          false;


        previewButton.textContent =
          "Preview";

      }

    };

}


/* =========================================================
   ADMIN BUTTONS
========================================================= */

if ($("manageProducts")) {

  $("manageProducts").onclick =
    adminProducts;

}


if ($("manageCategories")) {

  $("manageCategories").onclick =
    adminCategories;

}


if ($("transactions")) {

  $("transactions").onclick =
    adminTransactions;

}


if ($("workers")) {

  $("workers").onclick =
    adminWorkers;

}


if ($("pasteStockUpdate")) {

  $("pasteStockUpdate").onclick =
    pasteStockUpdate;

}


/* =========================================================
   RESTORE LOGIN SESSION
========================================================= */

window.addEventListener(
  "DOMContentLoaded",
  () => {

    const saved =
      localStorage.getItem(
        "jmp_worker"
      );


    /*
      We intentionally do NOT auto-login
      because the access code and PIN
      are required by several RPC functions.

      Keeping this behaviour avoids
      broken inventory calls after refresh.
    */

  }
);
