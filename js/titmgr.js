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

certHeader.appendChild(toggle);
certHeader.appendChild(label);


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
      domainHeader.innerHTML = `<span class="toggle-arrow">▶</span> <strong>${domainId}:</strong> ${domainTitle}`;
      domainHeader.style.cursor = "pointer";


      const subdomainList = document.createElement("div");
      subdomainList.className = "subdomain-list";
      subdomainList.style.display = "none";

      const subMap = subdomainMaps[certId]?.[domainId] || {};
      Object.entries(subMap).forEach(([subId, subTitle]) => {
        const subItem = document.createElement("div");
        subItem.className = "subdomain-item";
        subItem.textContent = `${subId}: ${subTitle}`;
        subItem.innerHTML = `${subId}: ${subTitle}`;


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
