// let certNames = {};
// let domainMaps = {};
// let subdomainMaps = {};

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
  
    console.log(`[resetDropdownToDefault] Set "${selectElement.id}" to:`, selectElement.value);
  }

///////////////////////////////// WIRE DOMAIN CONFIRM CANCEL BUTTONS //////////////////////////////////

  function wireDomainConfirmCancelButtons() {
    const saveBtn = document.getElementById("saveDomainTitleBtn");
    const cancelBtn = document.getElementById("cancelDomainTitleBtn");

    console.log("🧪 wireDomainConfirmCancelButtons()");
    console.log("saveBtn:", saveBtn);
    console.log("cancelBtn:", cancelBtn);

    if (!saveBtn || !cancelBtn) {
      console.warn("❌ save or cancel button is missing in DOM!");
      return;
    }
  
    saveBtn.addEventListener("click", async () => {
      const domainId = document.getElementById("domainIdDisplay").value;
      const domainTitle = document.getElementById("domainTitleInput").value.trim();
      const certId = document.getElementById("certIdSelect").value;
  
      if (!domainTitle) return alert("Please enter a domain title.");
  
      // Send to backend
      try {
        const res = await fetch("http://localhost:3000/api/add-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cert_id: certId,
            domain_id: domainId,
            domain_title: domainTitle
          })
        });
  
        if (!res.ok) throw new Error("Failed to save domain");
  
        const select = document.getElementById("domainTitleSelect");
        const option = new Option(`${domainId} ${domainTitle}`, `${domainId} ${domainTitle}`);
        select.appendChild(option);
        select.value = option.value;
  
        document.getElementById("domainTitleInput").value = "";
        document.getElementById("domainTitleSelectGroup").style.display = "flex";
        document.getElementById("domainTitleInputGroup").style.display = "none";
  
        // Refresh subdomains
        select.dispatchEvent(new Event("change", { bubbles: true }));
  
await window.refreshAllPanels?.();

showGlobalMessage("✅ Domain saved.", "success");

      } catch (err) {
        console.error(err);
        showGlobalMessage("❌ Failed to save domain.", "error");
      }
    });
  
    cancelBtn.addEventListener("click", () => {
      document.getElementById("domainTitleInput").value = "";
      document.getElementById("domainTitleInputGroup").style.display = "none";
      document.getElementById("domainTitleSelectGroup").style.display = "flex";
      document.getElementById("domainTitleSelect").selectedIndex = 0;
    });
  }
  
  function wireSubdomainConfirmCancelButtons() {
    const saveBtn = document.getElementById("saveSubdomainIdBtn");
    const cancelBtn = document.getElementById("cancelSubdomainIdBtn");
  
    saveBtn.addEventListener("click", async () => {
      const subId = document.getElementById("subdomainIdDisplay").value;
      const subTitle = document.getElementById("subdomainIdInput").value.trim();
      const certId = document.getElementById("certIdSelect").value;
      const domainRaw = document.getElementById("domainTitleSelect").value;
      const domainId = domainRaw.split(" ")[0]; // "1.0 Mobile Devices" → "1.0"
  
      if (!subTitle) return alert("Please enter a subdomain title.");
  
      try {
        const res = await fetch("http://localhost:3000/api/add-subdomain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cert_id: certId,
            domain_id: domainId,
            sub_id: subId,
            sub_title: subTitle
          })
        });
  
        if (!res.ok) throw new Error("Failed to save subdomain");
  
        const select = document.getElementById("subdomainIdSelect");
        const option = new Option(`${subId} ${subTitle}`, subId);
        select.appendChild(option);
        select.value = subId;
  
        document.getElementById("subdomainIdInput").value = "";
        document.getElementById("subdomainIdSelectGroup").style.display = "flex";
        document.getElementById("subdomainIdInputGroup").style.display = "none";
  
await window.refreshAllPanels?.();

showGlobalMessage("✅ Subdomain saved.", "success");

      } catch (err) {
        console.error(err);
        showGlobalMessage("❌ Failed to save subdomain.", "error");
      }
    });
  
    cancelBtn.addEventListener("click", () => {
      document.getElementById("subdomainIdInput").value = "";
      document.getElementById("subdomainIdInputGroup").style.display = "none";
      document.getElementById("subdomainIdSelectGroup").style.display = "flex";
      document.getElementById("subdomainIdSelect").selectedIndex = 0;
    });
  }
  
  
const dropdowns = {
  setupCreateNewSwitch,
  populateAdminFormDropdownsFromMaps,
  wireDomainConfirmCancelButtons,
  wireSubdomainConfirmCancelButtons,
  getNextSubdomainId
};

export default dropdowns;
