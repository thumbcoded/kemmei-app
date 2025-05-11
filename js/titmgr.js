async function loadTitleTree() {
  try {
    const res = await fetch("js/domainmap.json"); // served statically from frontend
    const data = await res.json();

    renderTitleTree(data.certNames, data.domainMaps, data.subdomainMaps);
  } catch (err) {
    console.error("❌ Failed to load domainmap.json:", err);
  }
}

function renderTitleTree(certNames, domainMaps, subdomainMaps) {
  const builtinList = document.getElementById("builtinTitleList");
  const userList = document.getElementById("userTitleList");
  const isBuiltIn = id => /^220-|^120|^N10-|^SY0-/.test(id);

  builtinList.innerHTML = "";
  userList.innerHTML = "";

  Object.entries(certNames).forEach(([certId, certTitle]) => {
    const certItem = document.createElement("li");
    certItem.className = "title-item";

    const certHeader = document.createElement("div");
    certHeader.className = "title-main";
    const toggle = document.createElement("span");
toggle.className = "toggle-arrow";
toggle.textContent = "▶";

const label = document.createElement("span");
label.textContent = certTitle;

// ////////////////////// ACTION COG AND BUTTONS //////////////////////

if (!isBuiltIn(certId)) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "space-between";
  wrapper.style.flex = "1";
  wrapper.style.position = "relative";

  // Left side: toggle + label
  const leftGroup = document.createElement("div");
  leftGroup.style.display = "flex";
  leftGroup.style.alignItems = "center";
  leftGroup.style.gap = "0.4rem";

  const toggle = document.createElement("span");
  toggle.className = "toggle-arrow";
  toggle.textContent = "▶";

  const label = document.createElement("span");
  label.textContent = certTitle;

  leftGroup.appendChild(toggle);
  leftGroup.appendChild(label);

  // Right side: gear + hidden actions
  const actionWrapper = document.createElement("div");
  actionWrapper.style.position = "relative";
  actionWrapper.style.display = "flex";
  actionWrapper.style.alignItems = "center";

  const gearBtn = document.createElement("button");
  gearBtn.textContent = "⚙️";
  gearBtn.className = "gear-btn";

  const actionRow = document.createElement("div");
  actionRow.className = "action-row";
  actionRow.style.display = "none";

  actionWrapper.addEventListener("mouseenter", () => {
    actionRow.style.display = "flex";
  });
  actionWrapper.addEventListener("mouseleave", () => {
    actionRow.style.display = "none";
  });

  const renameBtn = document.createElement("button");
  renameBtn.innerHTML = "✏️";
  const deleteBtn = document.createElement("button");
  deleteBtn.innerHTML = "🗑️";
  const exportBtn = document.createElement("button");
  exportBtn.innerHTML = "📤";
  actionRow.append(renameBtn, deleteBtn, exportBtn);

  actionWrapper.appendChild(gearBtn);
  actionWrapper.appendChild(actionRow);

  wrapper.appendChild(leftGroup);
  wrapper.appendChild(actionWrapper);
  certHeader.appendChild(wrapper);
}



else {
  certHeader.appendChild(toggle);
  certHeader.appendChild(label);
}

certHeader.style.cursor = "pointer";

const domainContainer = document.createElement("div");
domainContainer.className = "title-detail";
domainContainer.style.display = "none";

const domainMap = domainMaps[certId] || {};

Object.entries(domainMap).forEach(([domainId, domainTitle]) => {
const domainSection = document.createElement("div");
domainSection.className = "domain-section";

const domainHeader = document.createElement("div");
domainHeader.className = "domain-main";

const domainToggle = document.createElement("span");
  domainToggle.className = "toggle-arrow";
  domainToggle.textContent = "▶";

  const domainLabel = document.createElement("span");
  domainLabel.textContent = domainTitle;

  const domainWrapper = document.createElement("div");
  domainWrapper.style.display = "flex";
  domainWrapper.style.alignItems = "center";
  domainWrapper.style.justifyContent = "space-between";

  const leftGroup = document.createElement("div");
  leftGroup.style.display = "flex";
  leftGroup.style.alignItems = "center";
  leftGroup.style.gap = "0.4rem";
  leftGroup.appendChild(domainToggle);
  leftGroup.appendChild(domainLabel);

  domainWrapper.appendChild(leftGroup);

  if (!isBuiltIn(certId)) {
    const actionWrapper = document.createElement("div");
    actionWrapper.style.position = "relative";

    const gearBtn = document.createElement("button");
    gearBtn.textContent = "⚙️";
    gearBtn.className = "gear-btn";

    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.style.display = "none";

    actionWrapper.addEventListener("mouseenter", () => {
      actionRow.style.display = "flex";
    });
    actionWrapper.addEventListener("mouseleave", () => {
      actionRow.style.display = "none";
    });

    const renameBtn = document.createElement("button");
    renameBtn.innerHTML = "✏️";

    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = "🗑️";

    actionRow.append(renameBtn, deleteBtn);
    actionWrapper.appendChild(gearBtn);
    actionWrapper.appendChild(actionRow);
    domainWrapper.appendChild(actionWrapper);
  }

  domainHeader.appendChild(domainWrapper);

domainHeader.style.cursor = "pointer";


const subdomainList = document.createElement("div");
subdomainList.className = "subdomain-list";
subdomainList.style.display = "none";

const subMap = subdomainMaps[certId]?.[domainId] || {};
Object.entries(subMap).forEach(([subId, subTitle]) => {

  const subItem = document.createElement("div");
subItem.className = "subdomain-item";

const subLabel = document.createElement("span");
subLabel.textContent = subTitle;

const subWrapper = document.createElement("div");
subWrapper.style.display = "flex";
subWrapper.style.alignItems = "center";
subWrapper.style.justifyContent = "space-between";

subWrapper.appendChild(subLabel);

if (!isBuiltIn(certId)) {
  const actionWrapper = document.createElement("div");
  actionWrapper.style.position = "relative";

  const gearBtn = document.createElement("button");
  gearBtn.textContent = "⚙️";
  gearBtn.className = "gear-btn";

  const actionRow = document.createElement("div");
  actionRow.className = "action-row";
  actionRow.style.display = "none";

  actionWrapper.addEventListener("mouseenter", () => {
    actionRow.style.display = "flex";
  });
  actionWrapper.addEventListener("mouseleave", () => {
    actionRow.style.display = "none";
  });

  const renameBtn = document.createElement("button");
  renameBtn.innerHTML = "✏️";

  const deleteBtn = document.createElement("button");
  deleteBtn.innerHTML = "🗑️";

  actionRow.append(renameBtn, deleteBtn);
  actionWrapper.appendChild(gearBtn);
  actionWrapper.appendChild(actionRow);
  subWrapper.appendChild(actionWrapper);
}

subItem.appendChild(subWrapper);
subdomainList.appendChild(subItem);

subdomainList.appendChild(subItem);
});

domainHeader.addEventListener("click", () => {
const open = subdomainList.style.display === "block";
subdomainList.style.display = open ? "none" : "block";
domainHeader.querySelector(".toggle-arrow").textContent = open ? "▶" : "▼";
});

domainSection.appendChild(domainHeader);
domainSection.appendChild(subdomainList);
domainContainer.appendChild(domainSection);
});

certHeader.addEventListener("click", () => {
const open = domainContainer.style.display === "block";
domainContainer.style.display = open ? "none" : "block";
certHeader.querySelector(".toggle-arrow").textContent = open ? "▶" : "▼";
});

certItem.appendChild(certHeader);
certItem.appendChild(domainContainer);
(isBuiltIn(certId) ? builtinList : userList).appendChild(certItem);
});
}
// Auto-run when managerPanel is shown
document.addEventListener("DOMContentLoaded", () => {
  const toggleManager = document.getElementById("toggleManager");
  toggleManager.addEventListener("change", () => {
    if (toggleManager.checked) {
      loadTitleTree();
    }
  });
});

window.refreshTitleManager = loadTitleTree;
