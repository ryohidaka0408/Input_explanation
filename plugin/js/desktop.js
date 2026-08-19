(function(PLUGIN_ID) {
  'use strict';

  var config = kintone.plugin.app.getConfig(PLUGIN_ID);
  var fieldNotes = {};
  try {
    fieldNotes = JSON.parse(config.fieldNotes || '{}');
  } catch (e) {
    fieldNotes = {};
  }

  var noteFieldCodes = Object.keys(fieldNotes).filter(function(code) {
    return fieldNotes[code];
  });

  if (noteFieldCodes.length === 0) {
    return;
  }

  // 追加・編集画面ではkintone.app.record.getFieldElementが仕様上nullを返すため、
  // ラベルテキストとフィールドコードを対応付けるためにフィールド定義をキャッシュする
  var fieldMetaPromise = null;

  function getFieldMetaCache() {
    if (fieldMetaPromise) return fieldMetaPromise;
    var appId = kintone.app.getId();
    fieldMetaPromise = kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', { app: appId })
      .then(function(resp) {
        var cache = {};
        Object.keys(resp.properties).forEach(function(code) {
          cache[code] = resp.properties[code];
        });
        return cache;
      })
      .catch(function() {
        return {};
      });
    return fieldMetaPromise;
  }

  // kintoneのUIバージョンによりラベルを包むクラス名が異なる可能性があるため複数候補を用意
  var KNOWN_LABEL_SELECTORS = [
    '.control-label-text-gaia',
    '.control-label-text-gray',
    '.control-label-text',
    '[class*="control-label-text"]'
  ];

  function textMatches(el, target) {
    return !el.querySelector('.ihp-icon') && el.textContent.trim() === target;
  }

  // 追加・編集画面向け: getFieldElementが仕様上nullを返すため、画面全体から
  // ラベルのテキスト内容がフィールド名と完全一致する要素を探す
  function findLabelElementByText(label) {
    var target = label.trim();
    for (var i = 0; i < KNOWN_LABEL_SELECTORS.length; i++) {
      var candidates = document.querySelectorAll(KNOWN_LABEL_SELECTORS[i]);
      for (var j = 0; j < candidates.length; j++) {
        if (textMatches(candidates[j], target)) {
          return candidates[j];
        }
      }
    }
    return null;
  }

  function closeAllPopovers() {
    document.querySelectorAll('.ihp-popover').forEach(function(p) {
      p.parentNode.removeChild(p);
    });
  }

  document.addEventListener('click', closeAllPopovers);

  // [表示文字](URL) 形式のMarkdown風リンク記法。例: [app04](https://example.com/k/04/)
  var MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  var URL_PATTERN = /https?:\/\/[^\s]+/g;
  var URL_TRAILING_PUNCTUATION = /[。、,.!?！？」』）)\]]+$/;

  function appendLink(container, url, label) {
    var link = document.createElement('a');
    link.href = url;
    link.textContent = label;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    container.appendChild(link);
  }

  // Markdownリンク記法を含まない範囲に対して、生のURLをそのままリンク化する
  function renderPlainSegment(container, text) {
    var lastIndex = 0;
    var match;
    URL_PATTERN.lastIndex = 0;
    while ((match = URL_PATTERN.exec(text)) !== null) {
      var raw = match[0];
      var url = raw.replace(URL_TRAILING_PUNCTUATION, '');
      var trailing = raw.slice(url.length);

      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      appendLink(container, url, url);

      if (trailing) {
        container.appendChild(document.createTextNode(trailing));
      }

      lastIndex = match.index + raw.length;
    }
    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  // noteText内の [文字](URL) 記法と生URLをクリック可能な<a>要素に変換する。
  // innerHTMLは使わずDOM APIのみで構築するため、任意のHTML注入(XSS)は起こらない。
  function renderNoteContent(container, text) {
    var lastIndex = 0;
    var match;
    MARKDOWN_LINK_PATTERN.lastIndex = 0;
    while ((match = MARKDOWN_LINK_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        renderPlainSegment(container, text.slice(lastIndex, match.index));
      }
      appendLink(container, match[2], match[1]);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      renderPlainSegment(container, text.slice(lastIndex));
    }
  }

  function togglePopover(icon, wrap, noteText) {
    var existing = wrap.querySelector('.ihp-popover');
    closeAllPopovers();
    if (existing) return; // 既に開いていた場合はトグルクローズのみで再オープンしない

    var pop = document.createElement('div');
    pop.className = 'ihp-popover';
    renderNoteContent(pop, noteText);
    pop.addEventListener('click', function(ev) {
      ev.stopPropagation();
    });
    wrap.appendChild(pop);
  }

  function createIconElement(fieldCode, noteText) {
    var wrap = document.createElement('span');
    wrap.className = 'ihp-wrap';

    var icon = document.createElement('span');
    icon.className = 'ihp-icon';
    icon.dataset.fieldCode = fieldCode;
    icon.setAttribute('role', 'button');
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('aria-label', '注意事項を表示');
    icon.textContent = '?';

    icon.addEventListener('click', function(ev) {
      ev.stopPropagation();
      togglePopover(icon, wrap, noteText);
    });
    icon.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        togglePopover(icon, wrap, noteText);
      }
    });

    wrap.appendChild(icon);
    return wrap;
  }

  function insertHelpIcon(fieldCode, noteText, meta) {
    if (document.querySelector('.ihp-icon[data-field-code="' + fieldCode + '"]')) return;
    if (!meta || !meta.label) return;

    var labelEl = findLabelElementByText(meta.label);
    if (!labelEl) return;

    labelEl.appendChild(createIconElement(fieldCode, noteText));
  }

  function insertAllIcons() {
    getFieldMetaCache().then(function(meta) {
      noteFieldCodes.forEach(function(code) {
        insertHelpIcon(code, fieldNotes[code], meta[code]);
      });
    });
  }

  // レコード詳細画面は対象外(要件により追加・編集画面のみ)
  kintone.events.on([
    'app.record.create.show',
    'app.record.edit.show'
  ], function(event) {
    insertAllIcons();
    return event;
  });

})(kintone.$PLUGIN_ID);
