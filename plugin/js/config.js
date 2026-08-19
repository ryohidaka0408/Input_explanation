(function(PLUGIN_ID) {
  'use strict';

  // レイアウト用・システム系などフィールドラベルへの注記が意味を成さない型は対象外とする
  var EXCLUDED_TYPES = ['SPACER', 'HR', 'LABEL', 'SUBTABLE', 'GROUP'];

  var appId = kintone.app.getId();
  var savedConfig = kintone.plugin.app.getConfig(PLUGIN_ID);
  var fieldNotes = {};
  try {
    fieldNotes = JSON.parse(savedConfig.fieldNotes || '{}');
  } catch (e) {
    fieldNotes = {};
  }

  var loadingEl = document.getElementById('ihp-loading');
  var errorEl = document.getElementById('ihp-error');
  var rowsEl = document.getElementById('ihp-rows');
  var addButtonEl = document.getElementById('ihp-add-row-button');
  var rowTemplate = document.getElementById('ihp-row-template');

  var fieldOptions = []; // [{ code, label }]

  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', { app: appId })
    .then(function(resp) {
      fieldOptions = buildFieldOptions(resp.properties);
      initRows();
      loadingEl.style.display = 'none';
      rowsEl.style.display = '';
      addButtonEl.style.display = '';
    })
    .catch(function(err) {
      loadingEl.style.display = 'none';
      errorEl.style.display = '';
      errorEl.textContent = 'フィールド一覧の取得に失敗しました。画面を再読み込みしてください。('
        + (err && err.message ? err.message : String(err)) + ')';
    });

  function buildFieldOptions(properties) {
    var codes = Object.keys(properties).filter(function(code) {
      return EXCLUDED_TYPES.indexOf(properties[code].type) === -1;
    });
    codes.sort(function(a, b) {
      var la = properties[a].label || a;
      var lb = properties[b].label || b;
      return la.localeCompare(lb, 'ja');
    });
    return codes.map(function(code) {
      return { code: code, label: properties[code].label || code };
    });
  }

  function initRows() {
    var savedCodes = Object.keys(fieldNotes).filter(function(code) {
      return fieldNotes[code] && fieldOptions.some(function(f) { return f.code === code; });
    });

    if (savedCodes.length === 0) {
      addRow();
    } else {
      savedCodes.forEach(function(code) {
        addRow(code, fieldNotes[code]);
      });
    }
  }

  function addRow(selectedCode, noteText) {
    var fragment = rowTemplate.content.cloneNode(true);
    var rowEl = fragment.querySelector('.ihp-row');
    var selectEl = rowEl.querySelector('.ihp-field-select');
    var textareaEl = rowEl.querySelector('.ihp-note-textarea');
    var removeButtonEl = rowEl.querySelector('.ihp-remove-row-button');

    populateSelectOptions(selectEl, selectedCode);
    textareaEl.value = noteText || '';

    selectEl.addEventListener('change', refreshSelectOptions);
    removeButtonEl.addEventListener('click', function() {
      rowEl.remove();
      refreshSelectOptions();
    });

    rowsEl.appendChild(rowEl);
    refreshSelectOptions();
  }

  function populateSelectOptions(selectEl, currentValue) {
    selectEl.innerHTML = '';

    var emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'フィールドを選択...';
    selectEl.appendChild(emptyOption);

    fieldOptions.forEach(function(field) {
      var option = document.createElement('option');
      option.value = field.code;
      option.textContent = field.label + '（' + field.code + '）';
      selectEl.appendChild(option);
    });

    if (currentValue) selectEl.value = currentValue;
  }

  // 他の行で既に選択されているフィールドは、重複設定を防ぐためこのセレクトでは選べなくする
  function refreshSelectOptions() {
    var selectEls = rowsEl.querySelectorAll('.ihp-field-select');
    var selectedCodes = Array.prototype.map.call(selectEls, function(s) { return s.value; })
      .filter(function(v) { return v; });

    Array.prototype.forEach.call(selectEls, function(selectEl) {
      var ownValue = selectEl.value;
      Array.prototype.forEach.call(selectEl.options, function(option) {
        if (!option.value) return;
        option.disabled = selectedCodes.indexOf(option.value) !== -1 && option.value !== ownValue;
      });
    });
  }

  addButtonEl.addEventListener('click', function() {
    addRow();
  });

  document.getElementById('ihp-save-button').addEventListener('click', function() {
    var newNotes = {};
    var rows = rowsEl.querySelectorAll('.ihp-row');
    Array.prototype.forEach.call(rows, function(rowEl) {
      var code = rowEl.querySelector('.ihp-field-select').value;
      var note = rowEl.querySelector('.ihp-note-textarea').value;
      if (!code || !note) return;
      newNotes[code] = note;
    });

    kintone.plugin.app.setConfig(
      { fieldNotes: JSON.stringify(newNotes) },
      function() {
        location.href = 'https://' + location.host + '/k/admin/app/flow?app=' + appId;
      }
    );
  });

  document.getElementById('ihp-cancel-button').addEventListener('click', function() {
    location.href = 'https://' + location.host + '/k/admin/app/flow?app=' + appId;
  });

})(kintone.$PLUGIN_ID);
