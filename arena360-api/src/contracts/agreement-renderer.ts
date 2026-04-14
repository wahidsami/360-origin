type AgreementLocale = 'ar' | 'en';

export interface SaudiAgreementPayload {
  counterpartyName?: string;
  counterpartyRepresentative?: string;
  serviceDescription?: string;
  paymentTerms?: string;
  termDescription?: string;
  governingLaw?: string;
  jurisdiction?: string;
  includeConfidentiality?: boolean;
  includeDataProtection?: boolean;
  includeIntellectualProperty?: boolean;
  includeTermination?: boolean;
  includeForceMajeure?: boolean;
  includeNotices?: boolean;
  specialTerms?: string;
  isBilingual?: boolean;
  signerName?: string;
  signerTitle?: string;
}

export interface AgreementRenderContext {
  orgName: string;
  clientName: string;
  projectName: string;
  contractTitle: string;
  amount: number;
  currency: string;
  startDate: string;
  endDate?: string | null;
  locale: AgreementLocale;
  payload: SaudiAgreementPayload;
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toParagraphs = (value: unknown) =>
  String(value ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getHeading = (locale: AgreementLocale, ar: string, en: string, bilingual = false) =>
  bilingual
    ? `${escapeHtml(ar)}<span class="muted">${escapeHtml(en)}</span>`
    : escapeHtml(locale === 'ar' ? ar : en);

export function buildSaudiAgreementHtml(context: AgreementRenderContext) {
  const {
    orgName,
    clientName,
    projectName,
    contractTitle,
    amount,
    currency,
    startDate,
    endDate,
    locale,
    payload,
  } = context;
  const bilingual = !!payload.isBilingual;
  const primaryLaw = payload.governingLaw?.trim() || 'The laws and regulations of the Kingdom of Saudi Arabia';
  const jurisdiction =
    payload.jurisdiction?.trim() ||
    'The competent courts in the Kingdom of Saudi Arabia, unless the parties agree to arbitration in writing.';
  const counterpartyName = payload.counterpartyName?.trim() || clientName || 'Counterparty';
  const representative = payload.counterpartyRepresentative?.trim() || 'Authorized Representative';
  const serviceDescription =
    payload.serviceDescription?.trim() ||
    `Professional services related to ${projectName || contractTitle}.`;
  const paymentTerms =
    payload.paymentTerms?.trim() ||
    `The total amount of ${amount.toLocaleString()} ${currency} shall be due according to the agreed milestones and invoice schedule.`;
  const termDescription =
    payload.termDescription?.trim() ||
    `This agreement starts on ${formatDate(startDate)} and continues until ${endDate ? formatDate(endDate) : 'completion of the services'}, unless terminated earlier in accordance with the agreement.`;

  const clauseRows = [
    {
      enabled: payload.includeConfidentiality !== false,
      ar: '1. السرية',
      en: '1. Confidentiality',
      bodyAr:
        'يلتزم الطرفان بالمحافظة على سرية جميع المعلومات التجارية والفنية والمالية التي يتم تبادلها بموجب هذه الاتفاقية وعدم إفشائها إلا للقدر اللازم لتنفيذها أو بموجب التزام نظامي.',
      bodyEn:
        'Both parties shall keep confidential all commercial, technical, and financial information exchanged under this agreement and shall not disclose it except as required for performance or by law.',
    },
    {
      enabled: payload.includeDataProtection !== false,
      ar: '2. حماية البيانات',
      en: '2. Data Protection',
      bodyAr:
        'يتعهد الطرفان بمعالجة البيانات الشخصية والبيانات التشغيلية ذات الصلة وفق الأنظمة المعمول بها في المملكة العربية السعودية وبالقدر اللازم فقط لتنفيذ هذه الاتفاقية.',
      bodyEn:
        'The parties shall process personal and operational data in accordance with the applicable laws of the Kingdom of Saudi Arabia and only to the extent necessary to perform this agreement.',
    },
    {
      enabled: payload.includeIntellectualProperty !== false,
      ar: '3. الملكية الفكرية',
      en: '3. Intellectual Property',
      bodyAr:
        'تظل الحقوق السابقة على هذه الاتفاقية ملكا لأصحابها. وما لم ينص الاتفاق صراحة على خلاف ذلك، فإن المخرجات الخاصة بالمشروع تُمنح للعميل ضمن نطاق الاستخدام المتفق عليه.',
      bodyEn:
        'Pre-existing rights remain with their owners. Unless otherwise stated in writing, project deliverables are granted to the client for the agreed scope of use.',
    },
    {
      enabled: payload.includeTermination !== false,
      ar: '4. الإنهاء',
      en: '4. Termination',
      bodyAr:
        'يجوز إنهاء هذه الاتفاقية في حال الإخلال الجوهري أو باتفاق خطي مسبق بين الطرفين، مع حفظ الحقوق المستحقة حتى تاريخ الإنهاء.',
      bodyEn:
        'This agreement may be terminated for material breach or by prior written agreement between the parties, while preserving any accrued rights up to the termination date.',
    },
    {
      enabled: payload.includeForceMajeure !== false,
      ar: '5. القوة القاهرة',
      en: '5. Force Majeure',
      bodyAr:
        'لا يعد أي طرف مسؤولا عن التأخر أو عدم التنفيذ الناتج عن ظروف خارجة عن السيطرة المعقولة مثل الأعطال العامة أو الكوارث أو القرارات النظامية.',
      bodyEn:
        'Neither party shall be liable for delay or failure caused by circumstances beyond reasonable control, such as outages, disasters, or regulatory orders.',
    },
    {
      enabled: payload.includeNotices !== false,
      ar: '6. الإشعارات',
      en: '6. Notices',
      bodyAr:
        'تعد الإشعارات الإلكترونية عبر البريد الرسمي أو المنصة المعتمدة وسيلة صحيحة للتواصل بشأن تنفيذ هذه الاتفاقية متى أمكن تتبعها والرجوع إليها.',
      bodyEn:
        'Official email or platform notifications shall constitute valid notice for the purposes of this agreement when they are traceable and auditable.',
    },
    {
      enabled: true,
      ar: '7. التنفيذ والسجلات الإلكترونية',
      en: '7. Electronic Execution and Records',
      bodyAr:
        'يتفق الطرفان على أن هذه الاتفاقية يمكن إنشاؤها وتبادلها وحفظها وتوقيعها إلكترونيا، وأن السجلات والتوقيعات الإلكترونية المرتبطة بها تعد مقبولة بين الطرفين متى أمكن التحقق منها والرجوع إليها، وذلك دون الإخلال بأي متطلبات نظامية واجبة التطبيق داخل المملكة العربية السعودية.',
      bodyEn:
        'The parties agree that this agreement may be created, exchanged, stored, and signed electronically, and that the related electronic records and signatures are acceptable between the parties when they are verifiable and retrievable, without prejudice to any applicable requirements under the laws of the Kingdom of Saudi Arabia.',
    },
  ].filter((clause) => clause.enabled);

  const bilingualTag = bilingual ? 'bilingual' : 'mono';

  return `<!doctype html>
  <html lang="${locale === 'ar' ? 'ar' : 'en'}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(contractTitle)}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 40px;
          font-family: Arial, Helvetica, sans-serif;
          color: #10233d;
          background: #fff;
          direction: ${locale === 'ar' ? 'rtl' : 'ltr'};
        }
        .page {
          border: 1px solid #dbe4f0;
          border-radius: 18px;
          padding: 32px;
        }
        .brand {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          border-bottom: 1px solid #e8eef7;
          padding-bottom: 20px;
          margin-bottom: 24px;
        }
        .eyebrow {
          text-transform: uppercase;
          letter-spacing: .14em;
          font-size: 11px;
          color: #0f766e;
          font-weight: 700;
          margin-bottom: 8px;
        }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: 28px; line-height: 1.2; margin-bottom: 8px; }
        .muted { display: block; color: #5b6b83; font-size: 12px; margin-top: 2px; }
        .meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 22px;
        }
        .meta-card {
          border: 1px solid #e1e9f3;
          border-radius: 14px;
          padding: 14px 16px;
          background: #f8fbff;
        }
        .meta-card strong {
          display: block;
          font-size: 12px;
          color: #5b6b83;
          margin-bottom: 4px;
        }
        .meta-card span { font-size: 14px; font-weight: 700; color: #10233d; }
        .section {
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid #edf2f7;
        }
        .section h2 {
          font-size: 18px;
          margin-bottom: 10px;
        }
        .section p, .section li {
          font-size: 14px;
          line-height: 1.8;
          color: #24344d;
        }
        .clause {
          margin-top: 16px;
          padding: 14px 16px;
          border-radius: 12px;
          background: #f8fbff;
          border: 1px solid #e1e9f3;
        }
        .clause h3 {
          font-size: 15px;
          margin-bottom: 8px;
        }
        .clause .body + .body { margin-top: 10px; }
        .signature-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-top: 24px;
        }
        .signature-box {
          min-height: 110px;
          border: 1px dashed #a9b9cd;
          border-radius: 14px;
          padding: 16px;
        }
        .signature-box strong {
          display: block;
          margin-bottom: 6px;
        }
        .footer-note {
          margin-top: 24px;
          padding-top: 14px;
          border-top: 1px solid #e8eef7;
          color: #5b6b83;
          font-size: 12px;
          line-height: 1.7;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="brand">
          <div>
            <div class="eyebrow">Arena360 Agreement Builder</div>
            <h1>${escapeHtml(contractTitle)}</h1>
            <p class="muted">${escapeHtml(projectName)} ${bilingual ? '<span class="muted">Project Services Agreement</span>' : ''}</p>
          </div>
          <div style="text-align:${locale === 'ar' ? 'left' : 'right'}">
            <p><strong>${escapeHtml(orgName)}</strong></p>
            <p class="muted">${escapeHtml(counterpartyName)}</p>
          </div>
        </div>

        <div class="meta">
          <div class="meta-card"><strong>${locale === 'ar' ? 'الطرف الأول' : 'Party 1'}</strong><span>${escapeHtml(orgName)}</span></div>
          <div class="meta-card"><strong>${locale === 'ar' ? 'الطرف الثاني' : 'Party 2'}</strong><span>${escapeHtml(counterpartyName)}</span></div>
          <div class="meta-card"><strong>${locale === 'ar' ? 'قيمة الاتفاقية' : 'Agreement Value'}</strong><span>${escapeHtml(amount.toLocaleString())} ${escapeHtml(currency)}</span></div>
          <div class="meta-card"><strong>${locale === 'ar' ? 'فترة الاتفاقية' : 'Term'}</strong><span>${escapeHtml(startDate)}${endDate ? ` - ${escapeHtml(endDate)}` : ''}</span></div>
        </div>

        <div class="section">
          <h2>${getHeading(locale, 'أطراف الاتفاقية', 'Parties', bilingual)}</h2>
          <div class="clause">
            <div class="body">
              ${locale === 'ar'
                ? `<p>أبرمت هذه الاتفاقية بين <strong>${escapeHtml(orgName)}</strong> بصفته الطرف الأول، وبين <strong>${escapeHtml(counterpartyName)}</strong> بصفته الطرف الثاني، ويوقع عن الطرف الثاني ${escapeHtml(representative)}.</p>`
                : `<p>This agreement is entered into between <strong>${escapeHtml(orgName)}</strong> as the first party and <strong>${escapeHtml(counterpartyName)}</strong> as the second party, represented by ${escapeHtml(representative)}.</p>`}
            </div>
            ${bilingual ? `<div class="body"><p><strong>Arabic:</strong> بين الطرف الأول والطرف الثاني بشأن ${escapeHtml(projectName)}.</p><p><strong>English:</strong> Between Party 1 and Party 2 for ${escapeHtml(projectName)}.</p></div>` : ''}
          </div>
        </div>

        <div class="section">
          <h2>${getHeading(locale, 'نطاق العمل', 'Scope of Work', bilingual)}</h2>
          <div class="clause">
            ${toParagraphs(serviceDescription)}
          </div>
        </div>

        <div class="section">
          <h2>${getHeading(locale, 'المدة والأتعاب', 'Term and Fees', bilingual)}</h2>
          <div class="clause">
            ${toParagraphs(termDescription)}
            ${toParagraphs(paymentTerms)}
          </div>
        </div>

        <div class="section">
          <h2>${getHeading(locale, 'الأحكام النظامية', 'Legal Terms', bilingual)}</h2>
          ${clauseRows.map((clause) => `
            <div class="clause">
              <h3>${getHeading(locale, clause.ar, clause.en, bilingual)}</h3>
              <div class="body">
                ${locale === 'ar' ? `<p>${escapeHtml(clause.bodyAr)}</p>` : `<p>${escapeHtml(clause.bodyEn)}</p>`}
              </div>
              ${bilingual ? `<div class="body"><p><strong>Arabic:</strong> ${escapeHtml(clause.bodyAr)}</p><p><strong>English:</strong> ${escapeHtml(clause.bodyEn)}</p></div>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="section">
          <h2>${getHeading(locale, 'الأنظمة الحاكمة والاختصاص', 'Governing Law and Jurisdiction', bilingual)}</h2>
          <div class="clause">
            <p>${escapeHtml(primaryLaw)}</p>
            <p style="margin-top:8px;">${escapeHtml(jurisdiction)}</p>
          </div>
        </div>

        ${payload.specialTerms?.trim() ? `
        <div class="section">
          <h2>${getHeading(locale, 'شروط إضافية', 'Additional Terms', bilingual)}</h2>
          <div class="clause">${toParagraphs(payload.specialTerms)}</div>
        </div>
        ` : ''}

        <div class="section">
          <h2>${getHeading(locale, 'التوقيعات', 'Signatures', bilingual)}</h2>
          <div class="signature-grid">
            <div class="signature-box">
              <strong>${locale === 'ar' ? 'الطرف الأول' : 'Party 1'}</strong>
              <p>${escapeHtml(orgName)}</p>
              <p class="muted">${escapeHtml(payload.signerName || 'Authorized Signatory')}</p>
              <p class="muted">${escapeHtml(payload.signerTitle || 'Authorized Representative')}</p>
            </div>
            <div class="signature-box">
              <strong>${locale === 'ar' ? 'الطرف الثاني' : 'Party 2'}</strong>
              <p>${escapeHtml(counterpartyName)}</p>
              <p class="muted">${escapeHtml(representative)}</p>
            </div>
          </div>
        </div>

        <div class="footer-note">
          ${locale === 'ar'
            ? 'تم إنشاء هذه المسودة عبر Arena360 Agreement Builder كاتفاقية إلكترونية قابلة للحفظ والمراجعة والتوقيع، وتبقى خاضعة للمراجعة القانونية الداخلية قبل الاعتماد النهائي.'
            : 'This draft was generated by the Arena360 Agreement Builder as an electronic agreement suitable for review, record-keeping, and signature, and remains subject to internal legal review before final approval.'}
          ${bilingual ? '<br /><br />This template is intended to align with Saudi electronic-contracting practices and should be reviewed by qualified legal counsel before execution.' : ''}
        </div>
      </div>
    </body>
  </html>`;
}
