// Archived from js/dropdowns.js
// Original location: js/dropdowns.js
// Archived on: 2025-09-24

function getNextDomainId(certId, domainMaps) {
  const domains = domainMaps[certId] || {};
  const ids = Object.keys(domains).map(k => parseFloat(k)).filter(n => !isNaN(n));
  const next = Math.max(0, ...ids) + 1;
  return `${next.toFixed(1)}`;
}

function getNextSubdomainId(certId, domainId, subdomainMaps) {
  const subdomains = subdomainMaps[certId]?.[domainId] || {};
  const ids = Object.keys(subdomains).map(k => parseFloat(k.split(".")[1])).filter(n => !isNaN(n));
  const next = Math.max(0, ...ids) + 1;
  return `${domainId.split(".")[0]}.${next}`;
}

function setupCreateNewSwitch({ selectId, inputId, saveBtnId, cancelBtnId }) {
  // ...archived helper for admin UI
}

function populateAdminFormDropdownsFromMaps(certNames, domainMaps, subdomainMaps) {
  // ...archived implementation
}

function resetDropdownToDefault(selectElement) {
  // ...archived implementation
}

function wireDomainConfirmCancelButtons() {
  // ...archived implementation
}

function wireSubdomainConfirmCancelButtons() {
  // ...archived implementation
}

const dropdowns = {
  setupCreateNewSwitch,
  populateAdminFormDropdownsFromMaps,
  wireDomainConfirmCancelButtons,
  wireSubdomainConfirmCancelButtons,
  getNextSubdomainId
};

// archived: dropdowns object preserved for reference
const archived_dropdowns = dropdowns;
// Archived copy of js/dropdowns.js
// Full content preserved here for reference and potential restoration.

function getNextDomainId(certId, domainMaps) {
  const domains = domainMaps[certId] || {};

    const ids = Object.keys(domains).map(k => parseFloat(k)).filter(n => !isNaN(n));
    const next = Math.max(0, ...ids) + 1;
    return `${next.toFixed(1)}`;
  }
function getNextSubdomainId(certId, domainId, subdomainMaps) {
  const subdomains = subdomainMaps[certId]?.[domainId] || {};

  const ids = Object.keys(subdomains).map(k => parseFloat(k.split(".")[1])).filter(n => !isNaN(n));
  const next = Math.max(0, ...ids) + 1;
  return `${domainId.split(".")[0]}.${next}`;
}
  
function setupCreateNewSwitch({ selectId, inputId, saveBtnId, cancelBtnId }) {
  const select = document.getElementById(selectId);
  const input = document.getElementById(inputId);
  const saveBtn = document.getElementById(saveBtnId);
  const cancelBtn = document.getElementById(cancelBtnId);
  const selectWrapper = document.getElementById(selectId + "Group");
  const inputWrapper = document.getElementById(inputId + "Group");

  if (!select || !input || !cancelBtn || !saveBtn || !selectWrapper || !inputWrapper) {
    console.warn(`Missing elements for ${selectId} / ${inputId}`);
    return;
      
    }
  
    select.addEventListener("change", () => {
      if (select.value === "create_new") {
        selectWrapper.style.display = "none";
        inputWrapper.style.display = "flex";
        input.disabled = false;
        input.focus();
      }
    });
  
    cancelBtn.addEventListener("click", () => {
      input.value = "";
      inputWrapper.style.display = "none";
      selectWrapper.style.display = "flex";
      
      select.selectedIndex = 0;
    
    });

}

function populateAdminFormDropdownsFromMaps(certNames, domainMaps, subdomainMaps) {
    if (!window.ADMIN_ENABLED) {
      console.log('Admin disabled: skipping populateAdminFormDropdownsFromMaps');
      return;
    }

    console.log("💡 Populating form dropdowns from domainmap.json");
    console.log("certNames:", certNames);
  
    const certIdSelect = document.getElementById("certIdSelect");
    const domainTitleSelect = document.getElementById("domainTitleSelect");
    const subdomainIdSelect = document.getElementById("subdomainIdSelect");
  
    // Reset all
    [certIdSelect, domainTitleSelect, subdomainIdSelect].forEach(sel => {
      sel.innerHTML = `<option value="">Select...</option>`;
    });
  
    // Populate certs
    Object.entries(certNames).forEach(([certId, label]) => {
      const opt = document.createElement("option");
      opt.value = certId;
      opt.textContent = label;
      certIdSelect.appendChild(opt);
    });
  
    // Add static "create new" options
    [certIdSelect, domainTitleSelect, subdomainIdSelect].forEach(sel => {
      const opt = document.createElement("option");
      opt.value = "create_new";
      opt.textContent = "➕ Create new...";
      sel.appendChild(opt);
    });
  
    // Handle cert selection
    certIdSelect.addEventListener("change", () => {
      const selectedCert = certIdSelect.value;
    
      // 🛠️ Show create-new input fields
      if (selectedCert === "create_new") {
        document.getElementById("certIdSelectGroup").style.display = "none";
        document.getElementById("certIdInputGroup").style.display = "flex";
        document.getElementById("certIdInput").focus();
        return;
      }
    
      // ✅ Reset dropdowns
      domainTitleSelect.innerHTML = `<option value="">Select domain...</option>`;
      subdomainIdSelect.innerHTML = `<option value="">Select subdomain...</option>`;
      domainTitleSelect.disabled = true;
      subdomainIdSelect.disabled = true;
    
      if (!selectedCert) return;
  
      const domainEntries = domainMaps[selectedCert] ? Object.entries(domainMaps[selectedCert]) : [];
      
      domainEntries.forEach(([domainId, domainTitle]) => {
        const opt = new Option(`${domainId} ${domainTitle}`, `${domainId} ${domainTitle}`);
        domainTitleSelect.appendChild(opt);
      });
      
      // Always add "Create new..."
      const createNewOpt = new Option("➕ Create new...", "create_new");
      domainTitleSelect.appendChild(createNewOpt);
      
      // Enable select if at least 1 valid option now exists
      domainTitleSelect.disabled = domainTitleSelect.options.length <= 1;
      domainTitleSelect.addEventListener("change", () => {
        if (domainTitleSelect.value === "create_new") {
          const certId = certIdSelect.value;
          const nextDomainId = getNextDomainId(certId, domainMaps);
          document.getElementById("domainIdDisplay").value = nextDomainId;
      
          document.getElementById("domainTitleSelectGroup").style.display = "none";
          document.getElementById("domainTitleInputGroup").style.display = "flex";
          document.getElementById("domainTitleInput").focus();
        }
      });
      
      subdomainIdSelect.addEventListener("change", () => {
        if (subdomainIdSelect.value === "create_new") {
          const certId = certIdSelect.value;
          const domainRaw = domainTitleSelect.value;
          const domainId = domainRaw.split(" ")[0]; // expects "1.0 Mobile Devices"
          const nextSubId = getNextSubdomainId(certId, domainId, subdomainMaps);
          document.getElementById("subdomainIdDisplay").value = nextSubId;
      
          document.getElementById("subdomainIdSelectGroup").style.display = "none";
          document.getElementById("subdomainIdInputGroup").style.display = "flex";
          document.getElementById("subdomainIdInput").focus();
        }
      });
      
    });
    
  // Handle domain selection → populate subdomains
  
  domainTitleSelect.addEventListener("change", () => {
    const selectedCert = certIdSelect.value;
    const selectedValue = domainTitleSelect.value;
    subdomainIdSelect.innerHTML = `<option value="">Select subdomain...</option>`;
  
    if (!selectedCert || selectedValue === "create_new") {
      subdomainIdSelect.disabled = true;
      return;
    }
  
    const selectedDomain = selectedValue.split(" ")[0]; // e.g. "1.0"
    const subMap = subdomainMaps[selectedCert]?.[selectedDomain];
  
    if (subMap) {
      Object.entries(subMap).forEach(([subId, subTitle]) => {
        const opt = new Option(`${subId} ${subTitle}`, subId);
        subdomainIdSelect.appendChild(opt);
      });
    }
  
    // ✅ Always append "Create new..." at the end
    const createNew = new Option("➕ Create new...", "create_new");
    subdomainIdSelect.appendChild(createNew);
  
    subdomainIdSelect.disabled = subdomainIdSelect.options.length <= 1;
  });
  
  }

function resetDropdownToDefault(selectElement) {
    if (!selectElement || selectElement.tagName !== "SELECT") {
      console.warn("resetDropdownToDefault: not a valid <select> element", selectElement);
      return;
    }
  
    // Try to find the first non-disabled option
    const firstValidOption = Array.from(selectElement.options).find(
      (opt) => !opt.disabled && opt.value === ""
    );
  
    if (firstValidOption) {
      selectElement.value = firstValidOption.value;
    } else {
      // fallback: just go with first indexable option
      selectElement.selectedIndex = 0;
    }
  
    // Optionally, force change event to update any bound UI
    const event = new Event("change", { bubbles: true });
    selectElement.dispatchEvent(event);
}

// To restore: copy this file to `js/dropdowns.js` at project root
