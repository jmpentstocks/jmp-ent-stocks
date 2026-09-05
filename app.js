/* =========================================================
   BASIC HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   SUPABASE
========================================================= */

const db = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);


/* =========================================================
   APPLICATION STATE
========================================================= */

let worker = null;

let code = "";
let pin = "";

let busy = false;


/* ADMIN INVENTORY STATE */

let adminInventoryData = [];

let adminInventoryView = "consolidated";

let adminInventoryCategory = "all";


/* =========================================================
   ROLE CHECK
========================================================= */

function isAdmin() {

  if (!worker) return false;

  return String(
    worker.role || ""
  ).toLowerCase() === "admin";

}


/* =========================================================
   MODAL MANAGEMENT
========================================================= */

function getOpenModals() {

  return Array.from(
    document.querySelectorAll(".modal")
  );

}


function closeTopModal() {

  const modals = getOpenModals();

  if (!modals.length) return false;

  const modal = modals[modals.length - 1];

  modal.remove();

  busy = false;

  return true;

}


function closeAllModals() {

  document
    .querySelectorAll(".modal")
    .forEach(modal => modal.remove());

  busy = false;

}


/* =========================================================
   GENERIC MODAL
========================================================= */

function createModal(title, body, options = {}) {

  const modal =
    document.createElement("div");

  modal.className = "modal";

  modal.innerHTML = `

    <div class="modalbox">

      <h2>${title}</h2>

      ${body}

      ${
        options.showClose === false
          ? ""
          : `
          <button
            class="cancel modalClose"
            type="button"
            style="margin-top:15px;width:100%">
            ${options.closeText || "Close"}
          </button>
          `
      }

    </div>

  `;


  document.body.appendChild(modal);


  const closeButton =
    modal.querySelector(".modalClose");


  if (closeButton) {

    closeButton.onclick = () => {

      modal.remove();

      busy = false;

    };

  }


  /*
     Clicking dark background closes modal
     unless explicitly disabled
  */

  if (options.backdropClose !== false) {

    modal.addEventListener(
      "click",
      event => {

        if (event.target === modal) {

          modal.remove();

          busy = false;

        }

      }
    );

  }


  return modal;

}


/* =========================================================
   ADMIN MODAL
========================================================= */

function adminBox(title, body) {

  return createModal(
    title,
    body,
    {
      closeText: "Close"
    }
  );

}


/* =========================================================
   CENTRAL REFRESH SYSTEM

   This is the main fix for the inventory mismatch.

   After ANY data-changing action:
   Stock IN
   Stock OUT
   Product Edit
   Product Add
   Category Add
   Transaction Correction
   Paste Stock Update

   refreshAll() reloads the currently relevant
   inventory and summary information.
========================================================= */

async function refreshAll() {

  try {

    if (!worker) return;


    /*
       ADMIN
    */

    if (isAdmin()) {

      /*
         Refresh admin inventory data
         even if panel is currently hidden.
      */

      await loadAdminInventory(false);

    }


    /*
       WORKER
    */

    else {

      await loadWorkerInventory();

    }


  } catch (error) {

    console.error(
      "Refresh error:",
      error
    );

  }

}


/* =========================================================
   DASHBOARD VISIBILITY
========================================================= */

function hideDashboardSections() {

  const elements = [

    document.querySelector(".actions"),

    $("adminActions"),

    document.querySelector(".dashboard-stock-update"),

    $("workerInventoryPanel")

  ];


  elements.forEach(element => {

    if (element) {

      element.classList.add("hidden");

    }

  });

}


function showDashboardSections() {

  const actions =
    document.querySelector(".actions");


  if (actions) {

    actions.classList.remove("hidden");

  }


  if (isAdmin()) {

    $("adminActions")
      ?.classList.remove("hidden");


    document
      .querySelector(".dashboard-stock-update")
      ?.classList.remove("hidden");

  }

  else {

    $("workerInventoryPanel")
      ?.classList.remove("hidden");

  }

}


/* =========================================================
   LOGIN
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


  if (button) {

    button.disabled = true;

  }


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


    if (!data || !data.length) {

      $("loginMsg").textContent =
        "Incorrect access code or password.";

      return;

    }


    worker = data[0];


    /*
       Save worker session information.

       Credentials themselves are intentionally
       not auto-restored.
    */

    localStorage.setItem(
      "jmp_worker",
      JSON.stringify(worker)
    );


    if ($("welcome")) {

      $("welcome").textContent =
        "Signed in as " +
        (
          worker.worker_name ||
          worker.name ||
          ""
        );

    }


    $("loginScreen")
      ?.classList.add("hidden");


    $("homeScreen")
      ?.classList.remove("hidden");


    /*
       ADMIN VIEW
    */

    if (isAdmin()) {

      $("adminActions")
        ?.classList.remove("hidden");


      document
        .querySelector(".dashboard-stock-update")
        ?.classList.remove("hidden");


      $("workerInventoryPanel")
        ?.classList.add("hidden");


      $("adminInventoryPanel")
        ?.classList.add("hidden");

    }


    /*
       WORKER VIEW
    */

    else {

      $("adminActions")
        ?.classList.add("hidden");


      document
        .querySelector(".dashboard-stock-update")
        ?.classList.add("hidden");


      $("workerInventoryPanel")
        ?.classList.remove("hidden");

    }


    await refreshAll();


    $("loginMsg").textContent = "";


  } catch (error) {

    console.error(error);


    $("loginMsg").textContent =
      error.message ||
      "Login error.";

  }


  finally {

    if (button) {

      button.disabled = false;

    }

  }

}


/* =========================================================
   LOGIN BUTTON EVENTS
========================================================= */

if ($("signIn")) {

  $("signIn").onclick = login;

}


if ($("pin")) {

  $("pin").addEventListener(
    "keydown",
    event => {

      if (event.key === "Enter") {

        login();

      }

    }
  );

}


if ($("accessCode")) {

  $("accessCode").addEventListener(
    "keydown",
    event => {

      if (event.key === "Enter") {

        $("pin")?.focus();

      }

    }
  );

}


/* =========================================================
   LOGOUT
========================================================= */

if ($("logout")) {

  $("logout").onclick = () => {

    closeAllModals();

    localStorage.removeItem(
      "jmp_worker"
    );

    worker = null;

    code = "";
    pin = "";

    location.reload();

  };

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

    const products =
      await getWorkerProducts();


    if (!products.length) {

      list.innerHTML = `

        <div class="item">

          <div>

            <b>No products found</b>

            <small>
              No inventory available.
            </small>

          </div>

        </div>

      `;

      return;

    }


    list.innerHTML =
      products.map(product => {

        const quantity =
          Number(
            product.current_stock ??
            product.stock ??
            product.quantity ??
            0
          );


        const threshold =
          Number(
            product.threshold ?? 0
          );


        const low =
          threshold > 0 &&
          quantity <= threshold;


        return `

          <div class="item">

            <div>

              <b>

                ${escapeHtml(
                  product.product_name ||
                  product.name
                )}

              </b>


              <small>

                ${escapeHtml(
                  product.category_name ||
                  "Uncategorized"
                )}

              </small>

            </div>


            <div class="qty">

              ${quantity}

              ${
                product.unit
                  ? `<small>${escapeHtml(product.unit)}</small>`
                  : ""
              }


              ${
                low
                  ? `
                    <span class="badge low">
                      LOW
                    </span>
                    `
                  : ""
              }

            </div>

          </div>

        `;

      }).join("");


  } catch (error) {

    console.error(error);


    list.innerHTML = `

      <div class="item">

        <div>

          <b>Error loading inventory</b>

          <small>

            ${escapeHtml(
              error.message
            )}

          </small>

        </div>

      </div>

    `;

  }

}


/* =========================================================
   INVENTORY BUTTON
========================================================= */

if ($("inventory")) {

  $("inventory").onclick =
    async () => {

      if (!worker) return;


      if (isAdmin()) {

        await openAdminInventory();

      }

      else {

        $("workerInventoryPanel")
          ?.classList.remove("hidden");


        await loadWorkerInventory();

      }

    };

}


/* =========================================================
   ADMIN INVENTORY OPEN
========================================================= */

async function openAdminInventory() {

  if (!isAdmin()) return;


  hideDashboardSections();


  $("adminInventoryPanel")
    ?.classList.remove("hidden");


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


/* =========================================================
   CLOSE ADMIN INVENTORY
========================================================= */

function closeAdminInventory() {

  $("adminInventoryPanel")
    ?.classList.add("hidden");


  showDashboardSections();

}


/* =========================================================
   LOAD ADMIN INVENTORY
========================================================= */

async function loadAdminInventory(showLoading = true) {

  const list =
    $("adminInventoryList");


  if (!list) return;


  if (showLoading) {

    list.innerHTML =
      "Loading inventory...";

  }


  try {

    /*
       Existing backend function.

       IMPORTANT:
       No access code/PIN parameters are passed
       because your tested function returns the
       inventory directly.
    */

    const { data, error } =
      await db.rpc(
        "admin_inventory_by_location"
      );


    if (error) throw error;


    adminInventoryData =
      data || [];


    buildAdminCategoryTabs();


    renderAdminInventory();


  } catch (error) {

    console.error(error);


    list.innerHTML = `

      <div class="item">

        <div>

          <b>Error loading inventory</b>

          <small>

            ${escapeHtml(
              error.message
            )}

          </small>

        </div>

      </div>

    `;

  }

}


/* =========================================================
   BUILD ADMIN CATEGORY TABS
========================================================= */

function buildAdminCategoryTabs() {

  const box =
    $("adminCategoryTabs");


  if (!box) return;


  const categories = [];


  adminInventoryData.forEach(item => {

    if (
      item.category_id &&
      !categories.some(
        category =>
          Number(category.id) ===
          Number(item.category_id)
      )
    ) {

      categories.push({
        id: item.category_id,
        name: item.category_name
      });

    }

  });


  box.innerHTML = `

    <button
      class="category-tab ${
        adminInventoryCategory === "all"
          ? "active"
          : ""
      }"
      data-category="all"
      type="button">

      All

    </button>


    ${categories.map(category => `

      <button
        class="category-tab ${
          String(adminInventoryCategory) ===
          String(category.id)
            ? "active"
            : ""
        }"
        data-category="${category.id}"
        type="button">

        ${escapeHtml(category.name)}

      </button>

    `).join("")}

  `;


  box
    .querySelectorAll(".category-tab")
    .forEach(button => {

      button.onclick = () => {

        adminInventoryCategory =
          button.dataset.category;


        box
          .querySelectorAll(".category-tab")
          .forEach(tab => {

            tab.classList.remove("active");

          });


        button.classList.add("active");


        renderAdminInventory();

      };

    });

}


/* =========================================================
   RENDER ADMIN INVENTORY
========================================================= */

function renderAdminInventory() {

  const list =
    $("adminInventoryList");


  if (!list) return;


  const search =
    (
      $("adminProductSearch")?.value ||
      ""
    )
      .toLowerCase()
      .trim();


  let items =
    adminInventoryData.filter(item => {


      /*
         CATEGORY FILTER
      */

      if (
        adminInventoryCategory !== "all" &&
        Number(item.category_id) !==
        Number(adminInventoryCategory)
      ) {

        return false;

      }


      /*
         SEARCH FILTER
      */

      if (
        search &&
        !String(
          item.product_name || ""
        )
          .toLowerCase()
          .includes(search)
      ) {

        return false;

      }


      return true;

    });


  if (!items.length) {

    list.innerHTML = `

      <div class="item">

        <div>

          <b>No products found</b>

          <small>
            Try another category or search.
          </small>

        </div>

      </div>

    `;

    return;

  }


  list.innerHTML =
    items.map(item => {


      let stock = 0;


      /*
         KUMAR STOCK
      */

      if (
        adminInventoryView === "kumar"
      ) {

        stock =
          Number(item.kumar_stock || 0);

      }


      /*
         OFFICE STOCK
      */

      else if (
        adminInventoryView === "office"
      ) {

        stock =
          Number(item.office_stock || 0);

      }


      /*
         CONSOLIDATED STOCK
      */

      else {

        stock =
          Number(
            item.consolidated_stock ?? 0
          );

      }


      const threshold =
        Number(item.threshold || 0);


      const low =
        threshold > 0 &&
        stock <= threshold;


      return `

        <div class="item">

          <div>

            <b>

              ${escapeHtml(
                item.product_name
              )}

            </b>


            <small>

              ${escapeHtml(
                item.category_name ||
                "Uncategorized"
              )}

              · Threshold:
              ${threshold}

              ${
                item.unit
                  ? " " +
                    escapeHtml(item.unit)
                  : ""
              }

            </small>

          </div>


          <div class="qty">

            ${stock}

            ${
              item.unit
                ? `<small>${escapeHtml(item.unit)}</small>`
                : ""
            }


            <span
              class="badge ${
                low ? "low" : ""
              }">

              ${low ? "LOW" : "OK"}

            </span>

          </div>

        </div>

      `;

    }).join("");

}


/* =========================================================
   ADMIN STOCK VIEW TABS
========================================================= */

document
  .querySelectorAll(".stock-tab")
  .forEach(tab => {

    tab.onclick = () => {

      adminInventoryView =
        tab.dataset.stockView;


      document
        .querySelectorAll(".stock-tab")
        .forEach(button => {

          button.classList.toggle(
            "active",
            button === tab
          );

        });


      renderAdminInventory();

    };

  });


/* =========================================================
   ADMIN INVENTORY SEARCH
========================================================= */

if ($("adminProductSearch")) {

  $("adminProductSearch")
    .addEventListener(
      "input",
      renderAdminInventory
    );

}


/* =========================================================
   STOCK IN / STOCK OUT
========================================================= */

async function move(type) {

  if (!worker) return;


  if (busy) return;


  busy = true;


  try {

    const products =
      await getWorkerProducts();


    if (!products.length) {

      busy = false;

      alert(
        "No products available."
      );

      return;

    }


    /*
       Group products by category
    */

    const groups = {};


    products.forEach(product => {

      const category =
        product.category_name ||
        "Uncategorized";


      if (!groups[category]) {

        groups[category] = [];

      }


      groups[category].push(product);

    });


    const modal =
      createModal(

        `Stock ${type}`,

        `

        <p id="stockStepText">

          Select category:

        </p>


        <div id="categoryChoices">

          ${Object.keys(groups)
            .map(category => `

              <button
                class="product categoryChoice"
                data-category="${escapeHtml(category)}"
                type="button"
                style="width:100%;margin-bottom:10px">

                ${escapeHtml(category)}

              </button>

            `)
            .join("")}

        </div>


        <div
          id="productChoices"
          style="display:none">

        </div>


        <div
          id="qtyBox"
          class="qtybox"
          style="display:none">

          <p>

            Product:
            <b id="chosen"></b>

          </p>


          <input
            id="qty"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            placeholder="Enter quantity">


          <p
            id="stockMsg"
            class="message">

          </p>


          <button
            id="saveQty"
            class="save"
            type="button"
            style="width:100%;margin-top:10px">

            Save Stock ${type}

          </button>


          <button
            id="backToProducts"
            class="cancel"
            type="button"
            style="width:100%;margin-top:10px">

            ← Back to Products

          </button>

        </div>

        `

      );


    /*
       Store selected product safely
    */

    let selectedProduct = null;


    /*
       CATEGORY SELECTION
    */

    modal
      .querySelectorAll(".categoryChoice")
      .forEach(button => {

        button.onclick = () => {

          const category =
            button.dataset.category;


          const productBox =
            modal.querySelector(
              "#productChoices"
            );


          modal
            .querySelector("#categoryChoices")
            .style.display = "none";


          productBox.style.display =
            "block";


          modal
            .querySelector("#stockStepText")
            .textContent =
            "Select product:";


          productBox.innerHTML = `

            <button
              id="backCategory"
              class="cancel"
              type="button"
              style="width:100%;margin-bottom:12px">

              ← Back to Categories

            </button>


            ${
              groups[category]
                .map(product => {

                  const stock =
                    Number(
                      product.current_stock ??
                      product.stock ??
                      product.quantity ??
                      0
                    );


                  return `

                    <button
                      class="product productChoice"
                      data-id="${product.product_id || product.id}"
                      data-name="${escapeHtml(
                        product.product_name ||
                        product.name
                      )}"
                      data-stock="${stock}"
                      type="button"
                      style="width:100%;margin-bottom:10px">

                      <span>

                        ${escapeHtml(
                          product.product_name ||
                          product.name
                        )}

                      </span>


                      <small>

                        Current:
                        ${stock}

                      </small>

                    </button>

                  `;

                })
                .join("")
            }

          `;


          /*
             BACK TO CATEGORIES
          */

          productBox
            .querySelector("#backCategory")
            .onclick = () => {

              productBox.style.display =
                "none";


              modal
                .querySelector("#categoryChoices")
                .style.display =
                "block";


              modal
                .querySelector("#stockStepText")
                .textContent =
                "Select category:";

            };


          /*
             PRODUCT SELECTION
          */

          productBox
            .querySelectorAll(".productChoice")
            .forEach(productButton => {

              productButton.onclick = () => {

                selectedProduct = {

                  id:
                    Number(
                      productButton.dataset.id
                    ),

                  name:
                    productButton.dataset.name,

                  stock:
                    Number(
                      productButton.dataset.stock
                    )

                };


                productBox.style.display =
                  "none";


                modal
                  .querySelector("#qtyBox")
                  .style.display =
                  "block";


                modal
                  .querySelector("#stockStepText")
                  .textContent =
                  "Enter quantity:";


                modal
                  .querySelector("#chosen")
                  .textContent =
                  selectedProduct.name;


                setTimeout(() => {

                  modal
                    .querySelector("#qty")
                    ?.focus();

                }, 50);

              };

            });

        };

      });


    /*
       BACK FROM QUANTITY
       TO PRODUCTS
    */

    modal
      .querySelector("#backToProducts")
      .onclick = () => {

        modal
          .querySelector("#qtyBox")
          .style.display =
          "none";


        modal
          .querySelector("#productChoices")
          .style.display =
          "block";


        modal
          .querySelector("#stockStepText")
          .textContent =
          "Select product:";


        modal
          .querySelector("#qty")
          .value = "";


        modal
          .querySelector("#stockMsg")
          .textContent = "";

      };


    /*
       SAVE STOCK
    */

    modal
      .querySelector("#saveQty")
      .onclick = async () => {


        if (!selectedProduct) {

          modal
            .querySelector("#stockMsg")
            .textContent =
            "Select a product first.";

          return;

        }


        const quantity =
          Number(
            modal
              .querySelector("#qty")
              .value
          );


        if (
          !Number.isInteger(quantity) ||
          quantity < 1
        ) {

          modal
            .querySelector("#stockMsg")
            .textContent =
            "Enter a valid quantity.";

          return;

        }


        if (
          type === "OUT" &&
          quantity >
          selectedProduct.stock
        ) {

          modal
            .querySelector("#stockMsg")
            .textContent =
            "Insufficient stock.";

          return;

        }


        if (
          !confirm(
            `Save Stock ${type} of ${quantity} for ${selectedProduct.name}?`
          )
        ) {

          return;

        }


        const saveButton =
          modal.querySelector("#saveQty");


        saveButton.disabled = true;


        modal
          .querySelector("#stockMsg")
          .textContent =
          "Saving...";


        try {

          const { error } =
            await db.rpc(

              type === "IN"
                ? "stock_in"
                : "stock_out",

              {
                p_product_id:
                  selectedProduct.id,

                p_user_id:
                  worker.user_id,

                p_quantity:
                  quantity
              }

            );


          if (error) throw error;


          modal.remove();


          busy = false;


          /*
             CENTRAL REFRESH

             This fixes the original issue where
             stock changed in transactions but
             inventory screens continued showing
             old values.
          */

          await refreshAll();


          alert(
            `Stock ${type} saved successfully.`
          );


        } catch (error) {

          console.error(error);


          saveButton.disabled = false;


          modal
            .querySelector("#stockMsg")
            .textContent =
            error.message;

        }

      };


  } catch (error) {

    console.error(error);


    alert(
      error.message ||
      "Unable to load products."
    );


    busy = false;

  }

}


/* =========================================================
   STOCK BUTTON EVENTS
========================================================= */

if ($("stockIn")) {

  $("stockIn").onclick =
    () => move("IN");

}


if ($("stockOut")) {

  $("stockOut").onclick =
    () => move("OUT");

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
          placeholder="New category name"
          style="width:100%;padding:14px;box-sizing:border-box;border:1px solid #ccc;border-radius:10px">


        <button
          id="addCat"
          class="save"
          type="button"
          style="width:100%;margin-top:10px">

          Add Category

        </button>


        <div style="margin-top:15px">

          ${(data || []).map(category => `

            <div class="item">

              <div>

                <b>

                  ${escapeHtml(
                    category.name
                  )}

                </b>


                <small>

                  ${
                    category.active
                      ? "Active"
                      : "Inactive"
                  }

                </small>

              </div>

            </div>

          `).join("")}

        </div>

        `

      );


    modal
      .querySelector("#addCat")
      .onclick =
      async () => {


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


        await refreshAll();


        await adminCategories();

      };


  } catch (error) {

    console.error(error);

    alert(error.message);

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


    if (productsResult.error) {

      throw productsResult.error;

    }


    const categoriesResult =
      await db.rpc(
        "admin_categories",
        {
          p_code: code,
          p_pin: pin
        }
      );


    if (categoriesResult.error) {

      throw categoriesResult.error;

    }


    const products =
      productsResult.data || [];


    const categories =
      categoriesResult.data || [];


    const categoryOptions =
      categories
        .filter(category =>
          category.active
        )
        .map(category => `

          <option value="${category.id}">

            ${escapeHtml(category.name)}

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
          type="button"
          style="width:100%;margin-bottom:15px">

          + Add Product

        </button>


        <div>

          ${products.map(product => `

            <div class="item">

              <div>

                <b>

                  ${escapeHtml(
                    product.name
                  )}

                </b>


                <small>

                  ${escapeHtml(
                    product.category_name ||
                    "No category"
                  )}

                  · Threshold:
                  ${Number(
                    product.threshold || 0
                  )}

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


  } catch (error) {

    console.error(error);

    alert(error.message);

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

      <label>Product Name</label>

      <input
        id="pn"
        placeholder="Product name">


      <label>Category</label>

      <select id="pc">

        <option value="">
          No category
        </option>

        ${categoryOptions}

      </select>


      <label>Opening Stock</label>

      <input
        id="po"
        type="number"
        min="0"
        value="0">


      <label>Low Stock Threshold</label>

      <input
        id="pt"
        type="number"
        min="0"
        value="0">


      <button
        id="saveProduct"
        class="save"
        type="button"
        style="width:100%;margin-top:15px">

        Save Product

      </button>

      `

    );


  modal
    .querySelector("#saveProduct")
    .onclick =
    async () => {


      const name =
        modal
          .querySelector("#pn")
          .value
          .trim();


      const category =
        modal
          .querySelector("#pc")
          .value;


      const opening =
        Number(
          modal
            .querySelector("#po")
            .value || 0
        );


      const threshold =
        Number(
          modal
            .querySelector("#pt")
            .value || 0
        );


      if (!name) {

        alert(
          "Product name required."
        );

        return;

      }


      const saveButton =
        modal.querySelector(
          "#saveProduct"
        );


      saveButton.disabled = true;


      try {

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


        if (error) throw error;


        modal.remove();


        await refreshAll();


        alert(
          "Product added successfully."
        );


      } catch (error) {

        saveButton.disabled = false;

        alert(error.message);

      }

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
      item =>
        String(item.id) ===
        String(id)
    );


  if (!product) {

    alert(
      "Product not found."
    );

    return;

  }


  const modal =
    adminBox(

      "Edit Product",

      `

      <label>Product Name</label>

      <input
        id="en"
        value="${escapeHtml(
          product.name
        )}">


      <label>Category</label>

      <select id="ec">

        <option value="">
          No category
        </option>

        ${categoryOptions}

      </select>


      <label>Low Stock Threshold</label>

      <input
        id="et"
        type="number"
        min="0"
        value="${Number(
          product.threshold || 0
        )}">


      <label>Status</label>

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
        type="button"
        style="width:100%;margin-top:15px">

        Save Changes

      </button>

      `

    );


  if (product.category_id) {

    modal
      .querySelector("#ec")
      .value =
      product.category_id;

  }


  modal
    .querySelector("#ea")
    .value =
    String(product.active);


  modal
    .querySelector("#saveE")
    .onclick =
    async () => {


      const name =
        modal
          .querySelector("#en")
          .value
          .trim();


      const threshold =
        Number(
          modal
            .querySelector("#et")
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


      try {

        const { error } =
          await db.rpc(
            "admin_edit_product",
            {
              p_code: code,
              p_pin: pin,
              p_id: Number(id),

              p_name: name,

              p_category_id:
                modal
                  .querySelector("#ec")
                  .value
                  ? Number(
                      modal
                        .querySelector("#ec")
                        .value
                    )
                  : null,

              p_threshold: threshold,

              p_active:
                modal
                  .querySelector("#ea")
                  .value === "true"
            }
          );


        if (error) throw error;


        modal.remove();


        await refreshAll();


        alert(
          "Product updated successfully."
        );


      } catch (error) {

        saveButton.disabled = false;

        alert(error.message);

      }

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

          ${(data || []).length
            ? (data || []).map(transaction => `

                <div class="item">

                  <div>

                    <b>

                      ${escapeHtml(
                        transaction.product_name
                      )}

                    </b>


                    <small>

                      ${escapeHtml(
                        transaction.movement
                      )}

                      · Qty
                      ${Number(
                        transaction.quantity || 0
                      )}

                      <br>

                      ${
                        transaction.created_at
                          ? new Date(
                              transaction.created_at
                            ).toLocaleString()
                          : ""
                      }

                    </small>

                  </div>


                  <button
                    class="editTx"
                    data-id="${transaction.id}"
                    type="button">

                    Correct

                  </button>

                </div>

              `).join("")

            : `

              <div class="item">

                <div>

                  <b>No transactions found</b>

                </div>

              </div>

            `
          }

        </div>

        `

      );


    modal
      .querySelectorAll(".editTx")
      .forEach(button => {

        button.onclick = () => {

          modal.remove();


          correctTransaction(
            button.dataset.id,
            data || []
          );

        };

      });


  } catch (error) {

    console.error(error);

    alert(error.message);

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
      item =>
        String(item.id) ===
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


      <label>Movement</label>

      <select id="txMovement">

        <option value="IN">
          IN
        </option>

        <option value="OUT">
          OUT
        </option>

      </select>


      <label>Quantity</label>

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
        type="button"
        style="width:100%;margin-top:15px">

        Save Correction

      </button>

      `

    );


  modal
    .querySelector("#txMovement")
    .value =
    transaction.movement;


  modal
    .querySelector("#saveTx")
    .onclick =
    async () => {


      const movement =
        modal
          .querySelector("#txMovement")
          .value;


      const quantity =
        Number(
          modal
            .querySelector("#txQuantity")
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


      const saveButton =
        modal.querySelector("#saveTx");


      saveButton.disabled = true;


      try {

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


        if (error) throw error;


        modal.remove();


        await refreshAll();


        alert(
          "Transaction corrected successfully."
        );


      } catch (error) {

        saveButton.disabled = false;

        alert(error.message);

      }

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


    adminBox(

      "Workers",

      `

      <div>

        ${(data || []).length
          ? (data || []).map(person => `

              <div class="item">

                <div>

                  <b>

                    ${escapeHtml(
                      person.name ||
                      person.worker_name ||
                      ""
                    )}

                  </b>


                  <small>

                    ${escapeHtml(
                      person.access_code || ""
                    )}

                    ·

                    ${
                      person.active
                        ? "Active"
                        : "Inactive"
                    }

                  </small>

                </div>

              </div>

            `).join("")

          : `

            <div class="item">

              <div>

                <b>No workers found</b>

              </div>

            </div>

          `
        }

      </div>

      `

    );


  } catch (error) {

    console.error(error);

    alert(error.message);

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


    if (workerResult.error) {

      throw workerResult.error;

    }


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


    if (productResult.error) {

      throw productResult.error;

    }


    products =
      productResult.data || [];


  } catch (error) {

    console.error(error);

    alert(error.message);

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
        placeholder="Paste worker stock message here..."
        style="width:100%;padding:12px;box-sizing:border-box;border:1px solid #ccc;border-radius:10px;font-size:15px">

      </textarea>


      <button
        id="previewStockPaste"
        class="save"
        type="button"
        style="width:100%;margin-top:10px">

        Preview

      </button>


      <div id="stockPastePreview"></div>

      `

    );


  modal
    .querySelector("#previewStockPaste")
    .onclick =
    async () => {


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

          modal
            .querySelector("#stockPastePreview")
            .innerHTML = `

              <p class="message">

                No stock items could be read.

              </p>

            `;


          previewButton.disabled = false;

          previewButton.textContent =
            "Preview";

          return;

        }


        modal
          .querySelector("#stockPastePreview")
          .innerHTML = `

          <hr style="margin:20px 0">


          <label>Worker</label>

          <select
            id="stockWorker"
            style="width:100%;padding:12px;margin-bottom:15px">

            <option value="">
              Select worker
            </option>


            ${workers.map(person => `

              <option value="${
                person.id ||
                person.worker_id ||
                person.user_id
              }">

                ${escapeHtml(
                  person.name ||
                  person.worker_name ||
                  person.access_code ||
                  ""
                )}

              </option>

            `).join("")}

          </select>


          <h3>
            Stock Preview
          </h3>


          <div>

            ${items.map((item, index) => {


              const matched =
                String(
                  item.match_status || ""
                )
                  .toLowerCase() ===
                "matched";


              return `

                <div
                  class="item"
                  style="margin-bottom:8px">

                  <div>

                    <b>

                      ${escapeHtml(
                        item.message_product ||
                        item.product_name ||
                        ""
                      )}

                    </b>


                    <small>

                      Qty:
                      ${Number(item.quantity || 0)}

                      ${
                        item.message_unit
                          ? " " +
                            escapeHtml(
                              item.message_unit
                            )
                          : ""
                      }

                    </small>


                    ${
                      matched
                        ? `

                          <small>

                            Matched:
                            ${escapeHtml(
                              item.product_name ||
                              ""
                            )}

                          </small>

                          `

                        : `

                          <select
                            class="stockProductChoice"
                            data-index="${index}"
                            style="width:100%;padding:8px;margin-top:6px">

                            <option value="">
                              Select correct product
                            </option>


                            ${products
                              .filter(product =>
                                product.active !== false
                              )
                              .map(product => `

                                <option
                                  value="${product.id}">

                                  ${escapeHtml(
                                    product.name
                                  )}

                                </option>

                              `)
                              .join("")}

                          </select>

                          `
                    }

                  </div>

                </div>

              `;

            }).join("")}

          </div>


          <button
            id="confirmStockPaste"
            class="save"
            type="button"
            style="width:100%;margin-top:12px">

            Confirm & Update Stock

          </button>


          <p id="stockPasteMsg"></p>

          `;


        const confirmButton =
          modal.querySelector(
            "#confirmStockPaste"
          );


        confirmButton.onclick =
          async () => {


            const workerId =
              Number(
                modal
                  .querySelector("#stockWorker")
                  .value
              );


            if (!workerId) {

              alert(
                "Select the worker."
              );

              return;

            }


            const finalItems = [];


            for (
              let index = 0;
              index < items.length;
              index++
            ) {

              const item =
                items[index];


              let productId =
                Number(item.product_id);


              const matched =
                String(
                  item.match_status || ""
                )
                  .toLowerCase() ===
                "matched";


              if (!matched) {

                const choice =
                  modal.querySelector(
                    `.stockProductChoice[data-index="${index}"]`
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


            const messageBox =
              modal.querySelector(
                "#stockPasteMsg"
              );


            confirmButton.disabled = true;


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

                    p_worker_id:
                      workerId,

                    p_raw_message:
                      message,

                    p_items:
                      finalItems
                  }
                );


              if (error) throw error;


              modal.remove();


              await refreshAll();


              alert(
                "Stock update saved successfully."
              );


            } catch (error) {

              console.error(error);


              confirmButton.disabled =
                false;


              confirmButton.textContent =
                "Confirm & Update Stock";


              messageBox.textContent =
                error.message;

            }

          };


        previewButton.disabled = false;

        previewButton.textContent =
          "Preview";


      } catch (error) {

        console.error(error);


        alert(error.message);


        previewButton.disabled = false;

        previewButton.textContent =
          "Preview";

      }

    };

}


/* =========================================================
   ADMIN BUTTON EVENTS
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
   ESCAPE KEY

   Closes the top-most popup only.
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (event.key === "Escape") {

      if (closeTopModal()) {

        event.preventDefault();

      }

    }

  }
);


/* =========================================================
   BROWSER / ANDROID BACK BUTTON

   Priority:
   1. Close open popup
   2. Close admin inventory
   3. Keep user on dashboard
========================================================= */

history.replaceState(
  { jmp: true },
  "",
  location.href
);


window.addEventListener(
  "popstate",
  () => {


    /*
       OPEN MODAL
    */

    if (closeTopModal()) {

      history.pushState(
        { jmp: true },
        "",
        location.href
      );

      return;

    }


    /*
       ADMIN INVENTORY PANEL
    */

    if (
      !$("adminInventoryPanel")
        ?.classList.contains("hidden")
    ) {

      closeAdminInventory();


      history.pushState(
        { jmp: true },
        "",
        location.href
      );

      return;

    }


    /*
       Keep application stable
       on dashboard.
    */

    history.pushState(
      { jmp: true },
      "",
      location.href
    );

  }
);


/* =========================================================
   RESTORE LOGIN SCREEN SAFELY

   We intentionally do not automatically restore
   the login because your RPC functions require
   the access code and PIN for authenticated calls.

   This prevents the old issue where the app
   visually appeared logged in but inventory
   calls failed or returned stale data.
========================================================= */

window.addEventListener(
  "DOMContentLoaded",
  () => {

    /*
       Start clean on login screen.

       Existing saved worker data is retained only
       as non-sensitive session reference.
    */

    const saved =
      localStorage.getItem(
        "jmp_worker"
      );


    if (saved) {

      try {

        worker =
          JSON.parse(saved);

      } catch (error) {

        localStorage.removeItem(
          "jmp_worker"
        );

      }

    }


    /*
       Do not auto-open home screen.

       User must sign in again so code/pin
       are available for RPC calls.
    */

    worker = null;

  }
);


/* =========================================================
   END OF JMP ENT STOCKS APPLICATION
========================================================= */
