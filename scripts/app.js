// ===== VIEW SWITCHER =====
function showView(view) {
  document.querySelectorAll(".view-content").forEach((section) => {
    section.classList.add("hidden");
  });

  const targetView = document.getElementById(`view-${view}`);
  if (targetView) {
    targetView.classList.remove("hidden");
  }
}

(function bootstrapApp() {
  const createAlertModal = document.getElementById("modal-create-alert");

  function openModal(modalEl) {
    if (modalEl) {
      modalEl.classList.remove("hidden");
    }
  }

  function closeModal(modalEl) {
    if (modalEl) {
      modalEl.classList.add("hidden");
    }
  }

  // ===== CREATE ALERT BUTTONS =====
  const btnCreate = document.getElementById("btn-create-alert");
  if (btnCreate) {
    btnCreate.addEventListener("click", () => openModal(createAlertModal));
  }

  const btnClose = document.getElementById("btn-close-create-alert");
  if (btnClose) {
    btnClose.addEventListener("click", () => closeModal(createAlertModal));
  }

  const btnDiscard = document.getElementById("btn-discard-create-alert");
  if (btnDiscard) {
    btnDiscard.addEventListener("click", () => closeModal(createAlertModal));
  }

  // ===== CREATE INCIDENT FORM =====
  const incidentForm = document.getElementById("create-incident-form");

  function generateIncidentId() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const random = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");

    return `I${year}${month}-${random}`;
  }

  function buildTicketsFromForm() {
    const ticketItems = document.querySelectorAll("#ticket-container .ticket-item");

    return Array.from(ticketItems)
      .map((item) => {
        const fields = item.querySelectorAll("input");

        return {
          symphonyTicket: fields[0]?.value?.trim() || "",
          cid: fields[1]?.value?.trim() || "",
          port: fields[2]?.value?.trim() || "",
          downTime: fields[3]?.value || "",
          clearTime: fields[4]?.value || "",
          total: "",
          pending: fields[5]?.value?.trim() || "",
          actualDowntime: "",
          originate: fields[6]?.value?.trim() || "",
          terminate: fields[7]?.value?.trim() || "",
        };
      })
      .filter((ticket) => Object.values(ticket).some((value) => value));
  }

  if (incidentForm) {
    incidentForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const data = {
        incidentId: generateIncidentId(),
        workType: document.getElementById("f-type").value,
        node: document.getElementById("f-node").value,
        alarm: document.getElementById("f-alarm").value,
        detail: document.getElementById("f-detail").value,
        nocBy: "System",
        severity: "Medium",
        status: "ACTIVE",
        tickets: buildTicketsFromForm(),
      };

      AlertService.createAlert(data);
      closeModal(createAlertModal);
      incidentForm.reset();
    });
  }

  // ===== NAVIGATION =====
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", () => {
      Store.dispatch((state) => ({
        ...state,
        ui: {
          ...state.ui,
          currentView: el.dataset.view,
        },
      }));
    });
  });

  // ===== RENDER =====
  function render(state) {
    document.querySelectorAll(".view-content").forEach((view) => {
      view.classList.add("hidden");
    });

    if (state.ui.currentView === "alert") {
      const container = document.getElementById("alert-table-container");
      if (container) {
        container.innerHTML = "";
        container.appendChild(AlertUI.render(state));
      }
    }

    if (state.ui.currentView === "alert-detail") {
      const container = document.getElementById("view-alert-detail");
      if (container) {
        const incident = state.ui.selectedIncident || getSampleIncidentData();
        AlertDetailUI.render(incident);
      }
    }

    if (state.ui.currentView === "corrective") {
      const container = document.getElementById("corrective-container");
      if (container) {
        container.innerHTML = "";
        container.appendChild(CorrectiveUI.render(state));
      }
    }

    const activeView = document.getElementById(`view-${state.ui.currentView}`);
    if (activeView) {
      activeView.classList.remove("hidden");
    }

    document.querySelectorAll(".nav-item, .sub-nav-item").forEach((nav) => {
      nav.classList.remove("active");
    });

    const activeNav = document.querySelector(`[data-view="${state.ui.currentView}"]`);
    if (activeNav) {
      activeNav.classList.add("active");
    }
  }

  function getSampleIncidentData() {
    return {
      id: "I2602-000891",
      node: "Phahol9_02_M8",
      alarm: "Interface Down (at distributed switch)",
      detail:
        "We are observing alarm interface last mile down, require NS for investigating the cable.",
      downTime: "2026-02-08T23:52:00",
      nocBy: "Administrator",
      severity: "Critical",
      type: "Network",
      status: "active",
      createdAt: "2026-02-08T23:52:00",
      tickets: [
        {
          ticket: "T2602-001544",
          cid: "DI41155",
          port: "GigabitEthernet0/5/3",
          downTime: "2026-02-08T23:52:00",
          clearTime: "2026-02-09T00:16:00",
          total: "24 นาที",
          pending: null,
          actualDowntime: "24 นาที",
          originate: "Symphony Communication Public Company Limited",
          terminate: "Pruksa Real Estate Public Company Limited",
        },
        {
          ticket: "T2602-001545",
          cid: "DI41156",
          port: "GigabitEthernet0/5/4",
          downTime: "2026-02-08T23:55:00",
          clearTime: null,
          total: null,
          pending: "Waiting for ISP",
          actualDowntime: "รอดำเนินการ",
          originate: "Symphony Communication Public Company Limited",
          terminate: "Another Customer Co., Ltd.",
        },
        {
          ticket: "T2602-001546",
          cid: "DI41157",
          port: "GigabitEthernet0/5/5",
          downTime: "2026-02-09T01:00:00",
          clearTime: "2026-02-09T01:45:00",
          total: "45 นาที",
          pending: null,
          actualDowntime: "45 นาที",
          originate: "Symphony Communication Public Company Limited",
          terminate: "ABC Corporation",
        },
      ],
    };
  }

  Store.subscribe(render);

  // ===== ADD TICKET BUTTON =====
  const ticketContainer = document.getElementById("ticket-container");
  const addTicketBtn = document.getElementById("btn-add-ticket");

  if (addTicketBtn && ticketContainer) {
    addTicketBtn.addEventListener("click", () => {
      const ticketHTML = `
        <div class="ticket-item grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <input placeholder="Symphony Ticket" class="ticket-field w-full bg-slate-100 rounded-lg px-3 py-2">
          <input placeholder="Symphony CID" class="ticket-field w-full bg-slate-100 rounded-lg px-3 py-2">
          <input placeholder="Port" class="ticket-field w-full bg-slate-100 rounded-lg px-3 py-2">
          <input type="datetime-local" class="ticket-field w-full bg-slate-100 rounded-lg px-3 py-2">
          <input type="datetime-local" class="ticket-field w-full bg-slate-100 rounded-lg px-3 py-2">
          <input placeholder="Pending" class="ticket-field w-full bg-slate-100 rounded-lg px-3 py-2">
          <input placeholder="Originate" class="ticket-field w-full bg-slate-100 rounded-lg px-3 py-2">
          <input placeholder="Terminate" class="ticket-field w-full bg-slate-100 rounded-lg px-3 py-2">
        </div>
      `;

      ticketContainer.insertAdjacentHTML("beforeend", ticketHTML);
    });
  }

  // ===== RESPONSE MODAL =====
  const responseModal = document.getElementById("modal-response");
  const cancelResponse = document.getElementById("btn-cancel-response");
  const saveResponse = document.getElementById("btn-save-response");
  let responseIncidentId = null;

  document.addEventListener("click", (event) => {
    if (!event.target.classList.contains("btn-response")) {
      return;
    }

    responseIncidentId = event.target.dataset.id || null;
    openModal(responseModal);
  });

  if (cancelResponse) {
    cancelResponse.addEventListener("click", () => closeModal(responseModal));
  }

  if (saveResponse) {
    saveResponse.addEventListener("click", () => {
      const eta = document.querySelector('input[name="eta"]:checked');
      if (!eta) {
        alert("กรุณาเลือก ETA");
        return;
      }

      if (!responseIncidentId) {
        alert("ไม่พบ Incident ที่ต้องการตอบรับ");
        return;
      }

      AlertService.responseAlert(responseIncidentId, eta.value);
      closeModal(responseModal);
    });
  }

  // ===== CORRECTIVE MENU =====
  document.querySelectorAll("#corrective-submenu div").forEach((menu) => {
    menu.onclick = () => {
      const type = menu.innerText.toLowerCase();

      Store.dispatch((state) => ({
        ...state,
        ui: {
          ...state.ui,
          currentView: "corrective",
          activeCorrectiveTab: type,
        },
      }));
    };
  });


  function getCorrectiveIncidentById(incidentId) {
    const state = Store.getState();
    const tabs = ["fiber", "equipment", "other"];

    for (const tab of tabs) {
      const incident = (state.corrective[tab] || []).find((item) => item.incidentId === incidentId);
      if (incident) return { incident, tab };
    }

    return null;
  }

  function ensureUpdateModal() {
    if (document.getElementById("modal-corrective-update")) return;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div id="modal-corrective-update" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-5xl p-5 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 id="corrective-update-title" class="text-xl font-bold text-slate-800">NS Update</h3>
            <button id="btn-close-corrective-update" class="px-3 py-1 bg-slate-100 rounded-lg">ปิด</button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="border rounded-xl p-4 space-y-4">
              <h4 class="font-semibold text-slate-700">📍 ข้อมูลจุดเสีย</h4>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="text-sm text-slate-600">OFC Type:</label>
                  <select id="upd-ofc-type" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
                    <option value="">เลือกประเภท</option>
                    <option>Flat type 2 Core</option><option>4 Core ADSS</option><option>12 Core ADSS</option><option>24 Core ADSS</option>
                    <option>48 Core ADSS</option><option>60 Core ADSS</option><option>144 Core ADSS</option><option>216 Core ADSS</option>
                    <option>312 Core ADSS</option><option>12 Core Armour</option><option>48 Core Armour</option><option>60 Core Armour</option><option>144 Core Armour</option>
                  </select>
                </div>
                <div>
                  <label class="text-sm text-slate-600">สาเหตุ:</label>
                  <select id="upd-cause" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2">
                    <option value="">เลือกสาเหตุ</option>
                    <option>Animal gnawing</option><option>รถเกี่ยวสาย</option><option>ไฟไหม้</option><option>อุบัติเหตุทางถนน</option><option>OFC ปกติ</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="text-sm text-slate-600">Circuit ID + Customer (ไม่บังคับ):</label>
                <div class="grid grid-cols-1 gap-2 mt-1">
                  <select id="upd-originate" class="w-full bg-slate-100 rounded-lg px-3 py-2"></select>
                  <select id="upd-terminate" class="w-full bg-slate-100 rounded-lg px-3 py-2"></select>
                </div>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label class="text-xs text-slate-600">ชื่อ Site:</label>
                  <input id="upd-site" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น PKD">
                </div>
                <div>
                  <label class="text-xs text-slate-600">ระยะห่าง (เมตร):</label>
                  <input id="upd-distance" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น 8797">
                </div>
                <div>
                  <label class="text-xs text-slate-600">บริเวณ:</label>
                  <input id="upd-area" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น หน้าซอยสุขุมวิท 50">
                </div>
                <div>
                  <label class="text-xs text-slate-600">พิกัด (Lat, Long):</label>
                  <input id="upd-latlng" class="mt-1 w-full bg-slate-100 rounded-lg px-3 py-2" placeholder="เช่น 13.7054778, 100.5026162">
                </div>
              </div>

              <div>
                <label class="text-sm text-slate-600">Sub Contractor (เลือกได้หลายเจ้า):</label>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="TAS"> TAS</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="ATG"> ATG</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="NPY"> NPY</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="JJ&A"> JJ&A</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="TP"> TP</label>
                  <label class="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-lg"><input type="checkbox" class="upd-sub" value="JL"> JL</label>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <button id="btn-open-map" class="px-3 py-2 bg-red-500 text-white rounded-lg">🗺️ กดได้และดึงข้อมูล</button>
                <button id="btn-get-pin" class="px-3 py-2 bg-red-500 text-white rounded-lg">📍 กดได้และดึงข้อมูล</button>
              </div>
            </div>

            <div class="border rounded-xl p-4 space-y-3">
              <h4 class="font-semibold text-slate-700">🖼️ รูปภาพ / การดำเนินงาน</h4>

              <input id="upd-camera-input" type="file" accept="image/*" capture="environment" class="hidden">
              <input id="upd-file-input" type="file" multiple class="hidden">

              <div class="grid grid-cols-2 gap-2">
                <button id="btn-capture-photo" type="button" class="bg-slate-100 rounded-lg px-3 py-2">📷 ถ่ายภาพ</button>
                <button id="btn-attach-file" type="button" class="bg-slate-100 rounded-lg px-3 py-2">📎 แนบไฟล์</button>
              </div>

              <div id="upd-attachments-preview" class="text-xs text-slate-500 min-h-[20px]"></div>

              <div class="flex items-center gap-2">
                <span>Clock Status: <b id="upd-clock-status" class="text-green-600">STARTED</b></span>
                <button id="upd-start" class="px-2 py-1 bg-green-200 rounded">Start</button>
                <button id="upd-stop" class="px-2 py-1 bg-red-400 text-white rounded">Stop</button>
              </div>

              <div>
                <label class="text-sm text-slate-600">กรณีการดำเนินงาน:</label>
                <select id="upd-workcase" class="w-full bg-slate-100 rounded-lg px-3 py-2 mt-1">
                  <option>-- เลือกกรณี --</option>
                  <option>OFC ปกติ</option>
                  <option>กรณ์ OFC ตอนนอกปกติ</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <input id="upd-etr-hour" class="bg-slate-100 rounded-lg px-3 py-2" placeholder="ชั่วโมง">
                <input id="upd-etr-min" class="bg-slate-100 rounded-lg px-3 py-2" placeholder="นาที">
              </div>

              <button id="btn-generate-update" class="w-full px-3 py-2 bg-blue-500 text-white rounded-lg">⚙️ สร้างสรุป Update</button>
              <textarea id="upd-message" class="w-full bg-slate-100 rounded-lg px-3 py-2 h-32" placeholder="ข้อความอัปเดต (จะถูกสร้างอัตโนมัติ)"></textarea>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <button id="btn-cancel-corrective-update" class="px-4 py-2 bg-slate-200 rounded-lg">ยกเลิก</button>
            <button id="btn-save-corrective-update" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">บันทึก</button>
          </div>
        </div>
      </div>`
    );

    const modal = document.getElementById("modal-corrective-update");
    document.getElementById("btn-close-corrective-update").onclick = () => closeModal(modal);
    document.getElementById("btn-cancel-corrective-update").onclick = () => closeModal(modal);

    document.getElementById("upd-start").onclick = () => {
      document.getElementById("upd-clock-status").textContent = "STARTED";
      document.getElementById("upd-clock-status").className = "text-green-600";
      modal.dataset.startClockAt = new Date().toISOString();
    };

    document.getElementById("upd-stop").onclick = () => {
      document.getElementById("upd-clock-status").textContent = "STOPPED";
      document.getElementById("upd-clock-status").className = "text-red-600";
      modal.dataset.stopClockAt = new Date().toISOString();
    };

    const cameraInput = document.getElementById("upd-camera-input");
    const fileInput = document.getElementById("upd-file-input");
    const preview = document.getElementById("upd-attachments-preview");

    function renderAttachmentPreview() {
      const cameraFiles = Array.from(cameraInput.files || []);
      const attachFiles = Array.from(fileInput.files || []);
      const names = [...cameraFiles, ...attachFiles].map((file) => file.name);
      preview.textContent = names.length ? `ไฟล์ที่เลือก: ${names.join(", ")}` : "ยังไม่ได้เลือกไฟล์";
    }

    document.getElementById("btn-capture-photo").onclick = () => cameraInput.click();
    document.getElementById("btn-attach-file").onclick = () => fileInput.click();
    cameraInput.onchange = renderAttachmentPreview;
    fileInput.onchange = renderAttachmentPreview;
    renderAttachmentPreview();

    async function reverseGeocode(lat, lon) {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=th`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("reverse geocode failed");

        const data = await response.json();
        const name =
          data.name ||
          data.address?.amenity ||
          data.address?.shop ||
          data.address?.road ||
          data.address?.suburb ||
          data.display_name?.split(",")?.[0] ||
          "";

        return name;
      } catch {
        return "";
      }
    }

    document.getElementById("btn-get-pin").onclick = () => {
      if (!navigator.geolocation) return alert("อุปกรณ์ไม่รองรับ geolocation");

      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const latlng = `${lat}, ${lon}`;

        document.getElementById("upd-latlng").value = latlng;

        const place = await reverseGeocode(lat, lon);
        if (place) {
          document.getElementById("upd-area").value = place;
        }
      });
    };

    document.getElementById("btn-open-map").onclick = () => {
      const latlng = document.getElementById("upd-latlng").value.trim();
      const query = latlng || document.getElementById("upd-area").value.trim();
      if (!query) return alert("กรุณากรอกบริเวณหรือพิกัดก่อน");
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, "_blank");
    };
  }


  let updateIncidentId = null;

  function openCorrectiveUpdateModal(incidentId) {
    const found = getCorrectiveIncidentById(incidentId);
    if (!found) return;

    updateIncidentId = incidentId;
    const { incident } = found;
    ensureUpdateModal();

    const modal = document.getElementById("modal-corrective-update");
    document.getElementById("corrective-update-title").textContent = `NS Update (${incident.incidentId})`;

    const tickets = incident.tickets || [];
    const origins = [...new Set(tickets.map((t) => t.originate).filter(Boolean))];
    const terms = [...new Set(tickets.map((t) => t.terminate).filter(Boolean))];

    const originSel = document.getElementById("upd-originate");
    const termSel = document.getElementById("upd-terminate");
    originSel.innerHTML = `<option value="">-- เลือก Originate --</option>${origins.map((o) => `<option>${o}</option>`).join("")}`;
    termSel.innerHTML = `<option value="">-- เลือก Terminate --</option>${terms.map((t) => `<option>${t}</option>`).join("")}`;

    document.getElementById("upd-ofc-type").value = "";
    document.getElementById("upd-cause").value = "";
    document.getElementById("upd-site").value = "";
    document.getElementById("upd-distance").value = "";
    document.getElementById("upd-area").value = "";
    document.getElementById("upd-latlng").value = "";
    document.getElementById("upd-workcase").value = "-- เลือกกรณี --";
    document.getElementById("upd-etr-hour").value = "";
    document.getElementById("upd-etr-min").value = "";
    document.getElementById("upd-message").value = "";
    document.getElementById("upd-camera-input").value = "";
    document.getElementById("upd-file-input").value = "";
    document.querySelectorAll(".upd-sub").forEach((el) => { el.checked = false; });
    document.getElementById("upd-attachments-preview").textContent = "ยังไม่ได้เลือกไฟล์";
    modal.dataset.startClockAt = "";
    modal.dataset.stopClockAt = "";

    document.getElementById("btn-generate-update").onclick = () => {
      const latest = getCorrectiveIncidentById(updateIncidentId)?.incident;
      const updateNo = ((latest?.updates || []).length || 0) + 1;

      const ofcType = document.getElementById("upd-ofc-type").value || "OFC";
      const cause = document.getElementById("upd-cause").value || "ไม่ทราบสาเหตุ";
      const site = document.getElementById("upd-site").value || "ไม่ระบุ Site";
      const distanceM = document.getElementById("upd-distance").value || "0";
      const area = document.getElementById("upd-area").value || "ไม่ระบุพื้นที่";

      const km = (Number(distanceM || 0) / 1000).toFixed(3);
      document.getElementById("upd-message").value = `Update#${updateNo}: ตรวจสอบพบ ${ofcType} มีปัญหาห่างจาก Site ${site} ${km} km บริเวณ ${area}. สาเหตุ ${cause} กำลังเร่งดำเนินการแก้ไข.`;
    };

    document.getElementById("btn-save-corrective-update").onclick = () => {
      const current = Store.getState();
      const updatePayload = {
        at: new Date().toISOString(),
        ofcType: document.getElementById("upd-ofc-type").value,
        cause: document.getElementById("upd-cause").value,
        originate: document.getElementById("upd-originate").value,
        terminate: document.getElementById("upd-terminate").value,
        site: document.getElementById("upd-site").value,
        distance: document.getElementById("upd-distance").value,
        area: document.getElementById("upd-area").value,
        latlng: document.getElementById("upd-latlng").value,
        subcontractors: Array.from(document.querySelectorAll(".upd-sub:checked")).map((el) => el.value),
        clockStatus: document.getElementById("upd-clock-status").textContent,
        startClockAt: modal.dataset.startClockAt || "",
        stopClockAt: modal.dataset.stopClockAt || "",
        workCase: document.getElementById("upd-workcase").value,
        etrHour: document.getElementById("upd-etr-hour").value,
        etrMin: document.getElementById("upd-etr-min").value,
        message: document.getElementById("upd-message").value,
        attachments: [
          ...Array.from(document.getElementById("upd-camera-input").files || []).map((file) => file.name),
          ...Array.from(document.getElementById("upd-file-input").files || []).map((file) => file.name),
        ],
      };

      const nextCorrective = {
        fiber: (current.corrective.fiber || []).map((item) => item.incidentId === updateIncidentId ? { ...item, updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
        equipment: (current.corrective.equipment || []).map((item) => item.incidentId === updateIncidentId ? { ...item, updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
        other: (current.corrective.other || []).map((item) => item.incidentId === updateIncidentId ? { ...item, updates: [...(item.updates || []), updatePayload], latestUpdateMessage: updatePayload.message } : item),
      };

      LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective });
      Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
      closeModal(modal);
      alert("บันทึก Update เรียบร้อย");
    };

    openModal(modal);
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest(".btn-corrective-update");
    if (!target) return;
    openCorrectiveUpdateModal(target.dataset.id);
  });


  function formatDateTimeInput(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function addMinutes(dateInput, minutes) {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() + minutes);
    return d.toISOString();
  }

  function ensureFinishModal() {
    if (document.getElementById("modal-corrective-finish")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="modal-corrective-finish" class="modal-backdrop hidden">
        <div class="bg-white rounded-2xl w-full max-w-6xl p-6 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 id="finish-title" class="text-2xl font-bold text-slate-800">NS Finish</h3>
            <button id="btn-close-finish" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg">ปิด</button>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-slate-700">Incident Number:</label>
                <input id="finish-incident" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              </div>
              <div>
                <label class="text-sm font-semibold text-slate-700">Circuit ID + Customer:</label>
                <input id="finish-circuit" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              </div>
            </div>

            <div class="border rounded-xl p-3 bg-slate-50/60">
              <label class="text-sm font-semibold text-slate-700">Sub Contractor (เลือกได้หลายเจ้า):</label>
              <div class="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="TAS"> TAS</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="ATG"> ATG</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="NPY"> NPY</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="JJ&A"> JJ&A</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="TP"> TP</label>
                <label class="finish-sub-card"><input type="checkbox" class="finish-sub" value="JL"> JL</label>
              </div>
            </div>

            <div class="border-t pt-3">
              <h4 class="font-bold text-slate-800 mb-2">เวลาต่างๆ</h4>
              <button id="btn-auto-times" class="w-full bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-3">⚡ ตั้งเวลาอัตโนมัติ</button>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label class="text-sm text-slate-700">Down Time:</label><input id="finish-down-time" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">NOC Alert:</label><input id="finish-noc-alert" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">NS Response:</label><input id="finish-ns-response" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">เรียก Sub:</label><input id="finish-call-sub" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">Sub มาถึง:</label><input id="finish-sub-arrive" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">เริ่มแก้ไข:</label><input id="finish-start-fix" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">Up Time:</label><input id="finish-up-time" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">เก็บหัวต่อ:</label><input id="finish-store-connector" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
              </div>
            </div>

            <div class="border-t pt-3">
              <h4 class="font-bold text-slate-800 mb-2">Stop clock - Start clock</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label class="text-sm text-slate-700">Stop Clock:</label><input id="finish-stop-clock" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
                <div><label class="text-sm text-slate-700">Start Clock:</label><input id="finish-start-clock" type="datetime-local" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"></div>
              </div>
            </div>

            <div class="border-t pt-3">
              <h4 class="font-bold text-slate-800 mb-2">รายละเอียดงาน</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label class="text-sm text-slate-700">OFC Type:</label><select id="finish-ofc-type" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><option value="">เลือกประเภท</option><option>Flat type 2 Core</option><option>4 Core ADSS</option><option>12 Core ADSS</option><option>24 Core ADSS</option><option>48 Core ADSS</option><option>60 Core ADSS</option><option>144 Core ADSS</option><option>216 Core ADSS</option><option>312 Core ADSS</option><option>12 Core Armour</option><option>48 Core Armour</option><option>60 Core Armour</option><option>144 Core Armour</option></select></div>
                <div><label class="text-sm text-slate-700">ระยะห่างจาก Site (เมตร):</label><input id="finish-distance" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" placeholder="เช่น 90"></div>
                <div><label class="text-sm text-slate-700">ชื่อ Site:</label><input id="finish-site" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" placeholder="เช่น BTS Tower"></div>
                <div><label class="text-sm text-slate-700">สาเหตุ:</label><select id="finish-cause" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><option value="">เลือกสาเหตุ</option><option>Animal gnawing</option><option>รถเกี่ยวสาย</option><option>ไฟไหม้</option><option>อุบัติเหตุทางถนน</option><option>OFC ปกติ</option></select></div>
                <div>
                  <label class="text-sm text-slate-700">บริเวณ:</label>
                  <div class="mt-1 flex gap-2">
                    <input id="finish-area" class="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" placeholder="เช่น ถ.กัลปพฤกษ์">
                    <button id="btn-finish-map" class="px-3 py-2 bg-red-500 text-white rounded-lg">🗺️ ดึงที่อยู่</button>
                  </div>
                </div>
                <div>
                  <label class="text-sm text-slate-700">พิกัด (Lat, Long):</label>
                  <div class="mt-1 flex gap-2">
                    <input id="finish-latlng" class="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" placeholder="13.7054778, 100.5026162">
                    <button id="btn-finish-gps" class="px-3 py-2 bg-red-500 text-white rounded-lg">📍 GPS</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="border rounded-xl p-4 bg-slate-50 space-y-3">
              <div class="flex flex-wrap gap-2 items-center">
                <button id="btn-generate-repair" class="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg">🪄 สร้างคำอธิบายอัตโนมัติ</button>
                <select id="finish-method" class="w-full max-w-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <option value="">เลือกวิธีการ</option>
                  <option value="ลากคร่อม">ลากคร่อม</option>
                  <option value="ร่นลูป">ร่นลูป</option>
                  <option value="โยก Core">โยก Core</option>
                  <option value="ตัดต่อใหม่">ตัดต่อใหม่</option>
                  <option value="ค่าเร่งด่วน">ค่าเร่งด่วน</option>
                </select>
              </div>

              <div id="finish-method-common" class="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input id="finish-method-distance" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2" placeholder="ระยะ (เมตร)">
                <input id="finish-cutpoint" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2" placeholder="ตัดต่อใหม่ (จุด)">
                <input id="finish-core-point" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2" placeholder="จุดละ (Core)">
              </div>

              <div id="finish-method-yoke" class="hidden border rounded-lg p-3 bg-teal-50 space-y-2">
                <div class="text-sm text-slate-700 font-semibold">รายละเอียดโยก Core</div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input id="finish-site-a" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2" placeholder="จุดต้นทาง (Site/B/J/S)">
                  <input id="finish-site-b" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2" placeholder="จุดปลายทาง (Site/B/J/S)">
                </div>
                <textarea id="finish-circuit-list" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 h-24" placeholder="รายละเอียดลูกค้า/Circuit"></textarea>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select id="finish-urgent-level" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"><option>มีค่าเร่งด่วน</option><option>ไม่มีค่าเร่งด่วน</option></select>
                <input id="finish-head-joint" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2" placeholder="หัวต่อ">
                <select id="finish-connector-choice" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"><option>ไม่ใช้หัวต่อ</option><option>ใช้หัวต่อ</option></select>
              </div>

              <textarea id="finish-repair-text" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 h-24" placeholder="คำอธิบายการแก้ไข"></textarea>
              <select id="finish-patch-status" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"><option>ไม่ปรับ</option><option>ปรับ</option></select>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <button id="btn-cancel-finish" class="px-4 py-2 bg-slate-200 rounded-lg">ยกเลิก</button>
            <button id="btn-save-finish" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">บันทึก</button>
          </div>
        </div>
      </div>
    `);

    const modal = document.getElementById("modal-corrective-finish");
    document.getElementById("btn-close-finish").onclick = () => closeModal(modal);
    document.getElementById("btn-cancel-finish").onclick = () => closeModal(modal);

    document.querySelectorAll(".finish-sub-card").forEach((el) => {
      el.classList.add("flex", "items-center", "gap-2", "px-3", "py-2", "bg-white", "border", "rounded-lg");
    });

    document.getElementById("finish-up-time").addEventListener("change", () => {
      const up = document.getElementById("finish-up-time").value;
      if (!up) return;
      document.getElementById("finish-store-connector").value = formatDateTimeInput(addMinutes(up, 10));
    });

    document.getElementById("finish-method").addEventListener("change", (e) => {
      const method = e.target.value;
      document.getElementById("finish-method-yoke").classList.toggle("hidden", method !== "โยก Core");
      document.getElementById("finish-method-common").classList.toggle("hidden", method === "ค่าเร่งด่วน");
    });

    document.getElementById("btn-finish-map").onclick = () => {
      const q = document.getElementById("finish-latlng").value || document.getElementById("finish-area").value;
      if (!q) return;
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank");
    };

    document.getElementById("btn-finish-gps").onclick = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        document.getElementById("finish-latlng").value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
      });
    };
  }

  function generateRepairText() {
    const method = document.getElementById("finish-method").value || "";
    const methodDistance = document.getElementById("finish-method-distance").value || "-";
    const cutPoint = document.getElementById("finish-cutpoint").value || "-";
    const corePoint = document.getElementById("finish-core-point").value || "-";
    const siteA = document.getElementById("finish-site-a").value || "-";
    const siteB = document.getElementById("finish-site-b").value || "-";
    const circuitList = document.getElementById("finish-circuit-list").value || "-";

    let repairText = "";

    if (method === "ลากคร่อม") {
      repairText = `ดำเนินการลากคร่อมระยะทาง ${methodDistance} เมตร แล้วใช้งานได้ตามปกติ`;
    } else if (method === "ร่นลูป") {
      repairText = `ดำเนินการร่นลูประยะทาง ${methodDistance} เมตร แล้วใช้งานได้ตามปกติ`;
    } else if (method === "ตัดต่อใหม่") {
      repairText = `ดำเนินการตัดต่อใหม่จำนวน ${cutPoint} จุด จุดละ ${corePoint} Core แล้วใช้งานได้ตามปกติ`;
    } else if (method === "โยก Core") {
      repairText = [
        `ดำเนินการโยก Core จากจุด ${siteA} ไปยังจุด ${siteB}`,
        `พร้อมตัดต่อใหม่จำนวน ${cutPoint} จุด จุดละ ${corePoint} Core`,
        `รายละเอียด Circuit ที่โยก:\n${circuitList}`,
        "หลังดำเนินการแล้วใช้งานได้ตามปกติ",
      ].join("\n");
    } else if (method === "ค่าเร่งด่วน") {
      repairText = "ค่า Stand By เร่งด่วน (เรียกเร่งด่วนเนื่องจาก Interface Down หลังตรวจสอบพบ F/O ปกติ)";
    }

    if (!repairText) {
      return;
    }

    document.getElementById("finish-repair-text").value = repairText;
  }

  function openCorrectiveFinishModal(incidentId) {
    const found = getCorrectiveIncidentById(incidentId);
    if (!found) return;

    const { incident, tab } = found;
    ensureFinishModal();
    const modal = document.getElementById("modal-corrective-finish");
    document.getElementById("finish-title").textContent = `NS Finish (${incident.incidentId})`;

    const latestUpdate = (incident.updates || [])[incident.updates.length - 1] || {};
    const firstTicket = (incident.tickets || [])[0] || {};

    document.getElementById("finish-incident").value = incident.incidentId || "";
    document.getElementById("finish-circuit").value = `${firstTicket.cid || ""} ${firstTicket.port || ""}`.trim();

    document.getElementById("finish-ofc-type").value = latestUpdate.ofcType || "";
    document.getElementById("finish-distance").value = latestUpdate.distance || "";
    document.getElementById("finish-site").value = latestUpdate.site || "";
    document.getElementById("finish-cause").value = latestUpdate.cause || "";
    document.getElementById("finish-area").value = latestUpdate.area || "";
    document.getElementById("finish-latlng").value = latestUpdate.latlng || "";
    document.getElementById("finish-stop-clock").value = formatDateTimeInput(latestUpdate.stopClockAt);
    document.getElementById("finish-start-clock").value = formatDateTimeInput(latestUpdate.startClockAt);

    document.getElementById("finish-method").value = latestUpdate.workCase || "";
    document.getElementById("finish-method").dispatchEvent(new Event("change"));
    document.getElementById("finish-method-distance").value = "";
    document.getElementById("finish-cutpoint").value = "";
    document.getElementById("finish-core-point").value = "";
    document.getElementById("finish-site-a").value = "";
    document.getElementById("finish-site-b").value = "";
    document.getElementById("finish-circuit-list").value = "";
    document.getElementById("finish-repair-text").value = "";

    document.querySelectorAll(".finish-sub").forEach((el) => {
      el.checked = (latestUpdate.subcontractors || []).includes(el.value);
    });

    const down = firstTicket.downTime || incident.downTime || incident.createdAt;
    const noc = incident.createdAt || down;
    const responseAt = incident.respondedAt || incident.createdAt;

    function fillAutoTimes() {
      const callSub = addMinutes(responseAt, 5);
      const subArrive = addMinutes(callSub, 60);
      const startFix = addMinutes(subArrive, 10);

      document.getElementById("finish-down-time").value = formatDateTimeInput(down);
      document.getElementById("finish-noc-alert").value = formatDateTimeInput(noc);
      document.getElementById("finish-ns-response").value = formatDateTimeInput(responseAt);
      document.getElementById("finish-call-sub").value = formatDateTimeInput(callSub);
      document.getElementById("finish-sub-arrive").value = formatDateTimeInput(subArrive);
      document.getElementById("finish-start-fix").value = formatDateTimeInput(startFix);
    }

    fillAutoTimes();
    document.getElementById("btn-auto-times").onclick = fillAutoTimes;
    document.getElementById("btn-generate-repair").onclick = generateRepairText;

    document.getElementById("btn-save-finish").onclick = () => {
      const current = Store.getState();
      const payload = {
        incidentNumber: document.getElementById("finish-incident").value,
        circuitCustomer: document.getElementById("finish-circuit").value,
        subcontractors: Array.from(document.querySelectorAll(".finish-sub:checked")).map((el) => el.value),
        times: {
          downTime: document.getElementById("finish-down-time").value,
          nocAlert: document.getElementById("finish-noc-alert").value,
          nsResponse: document.getElementById("finish-ns-response").value,
          callSub: document.getElementById("finish-call-sub").value,
          subArrive: document.getElementById("finish-sub-arrive").value,
          startFix: document.getElementById("finish-start-fix").value,
          upTime: document.getElementById("finish-up-time").value,
          storeConnector: document.getElementById("finish-store-connector").value,
          stopClock: document.getElementById("finish-stop-clock").value,
          startClock: document.getElementById("finish-start-clock").value,
        },
        details: {
          ofcType: document.getElementById("finish-ofc-type").value,
          distance: document.getElementById("finish-distance").value,
          site: document.getElementById("finish-site").value,
          cause: document.getElementById("finish-cause").value,
          area: document.getElementById("finish-area").value,
          latlng: document.getElementById("finish-latlng").value,
          method: document.getElementById("finish-method").value,
          methodDistance: document.getElementById("finish-method-distance").value,
          cutPoint: document.getElementById("finish-cutpoint").value,
          corePoint: document.getElementById("finish-core-point").value,
          siteA: document.getElementById("finish-site-a").value,
          siteB: document.getElementById("finish-site-b").value,
          circuitList: document.getElementById("finish-circuit-list").value,
          urgentLevel: document.getElementById("finish-urgent-level").value,
          headJoint: document.getElementById("finish-head-joint").value,
          connectorChoice: document.getElementById("finish-connector-choice").value,
          repairText: document.getElementById("finish-repair-text").value,
          patchStatus: document.getElementById("finish-patch-status").value,
        },
      };

      const nextCorrective = { ...current.corrective };
      nextCorrective[tab] = (nextCorrective[tab] || []).map((item) =>
        item.incidentId === incidentId ? { ...item, nsFinish: payload, status: "COMPLETE" } : item
      );

      LocalDB.saveState({ alerts: current.alerts, corrective: nextCorrective });
      Store.dispatch((state) => ({ ...state, corrective: nextCorrective }));
      closeModal(modal);
      alert("บันทึก NS Finish เรียบร้อย");
    };

    openModal(modal);
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest(".btn-corrective-finish");
    if (!target) return;
    openCorrectiveFinishModal(target.dataset.id);
  });

  // ===== INITIAL LOAD =====
  (async function init() {
    AlertService.loadFromLocal();
    // await AlertService.loadFromEmail();
  })();
})();