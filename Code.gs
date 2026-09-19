var TextbookSelectionGas = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region app/setup-types.ts
	function normalizeSchoolId(value) {
		return typeof value === "string" ? value.trim().toLowerCase() : "";
	}
	function isSchoolLoginId(value) {
		const id = normalizeSchoolId(value);
		return id.length >= 2 && id.length <= 64 && /^[a-z0-9가-힣][a-z0-9가-힣._-]*(?:@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)?$/.test(id);
	}
	var normalizeSetupEmail = normalizeSchoolId;
	function setupIdentity(setup, email) {
		if (!setup) return null;
		const normalized = normalizeSetupEmail(email);
		const staff = setup.staff.find((item) => normalizeSetupEmail(item.email) === normalized);
		const manager = normalizeSetupEmail(setup.managerEmail) === normalized;
		const vicePrincipal = normalizeSetupEmail(setup.vicePrincipalEmail) === normalized;
		return staff || manager || vicePrincipal ? {
			name: (staff === null || staff === void 0 ? void 0 : staff.name) || (manager ? setup.managerName : setup.vicePrincipalName),
			subjects: (staff === null || staff === void 0 ? void 0 : staff.subjects) || [],
			manager,
			vicePrincipal
		} : null;
	}
	//#endregion
	//#region app/selection-units.ts
	var unique = (values) => [...new Set(values)];
	var stablePart = (value) => value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "unit";
	function emptyReviews(names) {
		return unique(names).map((teacher) => ({
			teacher,
			ranked: [],
			scores: {},
			opinion: "",
			signed: false
		}));
	}
	function legacySignatures(signatures, subject, unitId) {
		const mapped = {};
		for (const suffix of [
			"summary:writer",
			"summary:checker",
			"recommend:writer",
			"recommend:approver"
		]) {
			const signature = signatures[`${subject}:${suffix}`];
			if (signature) mapped[selectionKey(unitId, suffix)] = signature;
		}
		return mapped;
	}
	function legacyOpinionSources(sources, subject, unitId) {
		const mapped = {};
		for (const [key, value] of Object.entries(sources)) {
			const reviewPrefix = `review:${subject}:`;
			const recommendationPrefix = `recommend:${subject}:`;
			if (key.startsWith(reviewPrefix)) mapped[selectionKey(unitId, `review:${key.slice(reviewPrefix.length)}`)] = value;
			if (key.startsWith(recommendationPrefix)) mapped[selectionKey(unitId, `recommend:${key.slice(recommendationPrefix.length)}`)] = value;
		}
		return mapped;
	}
	function migrateLegacyUnits(state) {
		if (Array.isArray(state.selectionUnits) && state.selectionUnits.length) return state.selectionUnits.map((unit) => ({
			...unit,
			volumes: Array.isArray(unit.volumes) ? unit.volumes : [],
			status: unit.status || "draft",
			candidates: Array.isArray(unit.candidates) ? unit.candidates : [],
			criteria: Array.isArray(unit.criteria) ? unit.criteria : state.criteria,
			reviews: Array.isArray(unit.reviews) ? unit.reviews : emptyReviews(state.members[unit.subject] || []),
			recommendations: unit.recommendations || {},
			signatures: unit.signatures || {},
			opinionSources: unit.opinionSources || {},
			topScore: Number.isFinite(unit.topScore) ? unit.topScore : state.topScore,
			gap: Number.isFinite(unit.gap) ? unit.gap : state.gap
		}));
		return unique([...Object.keys(state.members || {}), ...state.books.map((book) => book.subject)]).map((subject) => {
			const unitId = `legacy-${stablePart(subject)}`;
			const books = state.books.filter((book) => book.subject === subject);
			const bookIds = new Set(books.map((book) => book.id));
			const members = new Set(state.members[subject] || []);
			return {
				id: unitId,
				subject,
				label: subject,
				mode: "single",
				volumes: [],
				status: "active",
				candidates: books.map((book) => ({
					id: book.id,
					label: "",
					bookIds: [book.id]
				})),
				criteria: state.criteria.map((criterion) => ({ ...criterion })),
				reviews: state.reviews.filter((review) => members.has(review.teacher)).map((review) => {
					const ranked = review.ranked.filter((id) => bookIds.has(id));
					return {
						...review,
						ranked: [...ranked, ...books.map((book) => book.id).filter((id) => !ranked.includes(id))],
						scores: Object.fromEntries(Object.entries(review.scores || {}).filter(([id]) => bookIds.has(id)))
					};
				}),
				topScore: state.topScore,
				gap: state.gap,
				recommendations: Object.fromEntries(Object.entries(state.recommendations || {}).filter(([id]) => bookIds.has(id))),
				signatures: legacySignatures(state.signatures || {}, subject, unitId),
				opinionSources: legacyOpinionSources(state.opinionSources || {}, subject, unitId)
			};
		});
	}
	function activateSelectionUnit(state, unitId) {
		const unit = state.selectionUnits.find((item) => item.id === unitId);
		if (!unit) return state;
		return {
			...state,
			activeUnitId: unit.id,
			subject: unit.subject,
			criteria: unit.criteria,
			reviews: unit.reviews,
			topScore: unit.topScore,
			gap: unit.gap,
			recommendations: unit.recommendations,
			signatures: unit.signatures,
			opinionSources: unit.opinionSources
		};
	}
	function selectionUnitHasActivity(unit) {
		return unit.reviews.some(reviewHasActivity) || Object.keys(unit.recommendations).length > 0 || Object.keys(unit.signatures).length > 0;
	}
	function reviewHasActivity(review) {
		return review.ranked.length > 0 || Object.keys(review.scores || {}).length > 0 || Boolean(review.opinion.trim()) || review.signed || Boolean(review.signature);
	}
	function resetReview(review) {
		return {
			teacher: review.teacher,
			...Number.isInteger(review.autoTopScore) ? { autoTopScore: review.autoTopScore } : {},
			ranked: [],
			scores: {},
			opinion: "",
			signed: false
		};
	}
	function resetSelectionUnitEvaluation(unit) {
		return {
			...unit,
			reviews: unit.reviews.map(resetReview),
			recommendations: {},
			signatures: {},
			opinionSources: {}
		};
	}
	function selectionKey(unitId, suffix) {
		return `unit:${unitId}:${suffix}`;
	}
	function validateSelectionUnit(unit, books) {
		const errors = [];
		if (!Array.isArray(unit.candidates) || !Array.isArray(unit.volumes)) return [`${unit.label || "선정 단위"}: 후보 또는 권 구성을 확인해 주세요.`];
		if (new Set(unit.volumes).size !== unit.volumes.length) errors.push(`${unit.label}: 학년·학기/권 구분이 중복되었습니다.`);
		const seen = /* @__PURE__ */ new Set();
		for (const candidate of unit.candidates) {
			if (!(candidate === null || candidate === void 0 ? void 0 : candidate.id) || !Array.isArray(candidate.bookIds)) {
				errors.push(`${unit.label}: 평가 후보 구성을 확인해 주세요.`);
				continue;
			}
			if (seen.has(candidate.id)) errors.push(`${unit.label}: 평가 후보 ID가 중복되었습니다.`);
			seen.add(candidate.id);
			const components = candidate.bookIds.map((id) => books.find((book) => book.id === id)).filter((book) => Boolean(book));
			if (components.length !== candidate.bookIds.length) errors.push(`${unit.label}: 삭제되었거나 찾을 수 없는 도서가 연결되어 있습니다.`);
			if (components.some((book) => book.subject !== unit.subject)) errors.push(`${unit.label}: 다른 과목 도서가 연결되어 있습니다.`);
			if (unit.mode !== "bundle" && components.length !== 1) errors.push(`${unit.label}: 개별 선정 후보에는 도서 1권만 연결해 주세요.`);
			if (unit.mode !== "bundle" && unit.volumes.length > 0 && components.some((book) => !unit.volumes.includes(book.volume))) errors.push(`${unit.label}: 설정한 학년·학기/권과 다른 도서가 연결되어 있습니다.`);
			if (unit.mode === "bundle") {
				if (components.length !== unit.volumes.length || new Set(candidate.bookIds).size !== candidate.bookIds.length) errors.push(`${unit.label}: 묶음마다 각 권을 한 권씩 연결해 주세요.`);
				const publishers = unique(components.map((book) => book.publisher.trim()).filter(Boolean));
				if (components.some((book) => !book.publisher.trim())) errors.push(`${unit.label}: 묶음 도서의 출판사를 모두 입력해 주세요.`);
				if (publishers.length > 1) errors.push(`${unit.label}: 묶음 후보의 출판사가 서로 다릅니다.`);
				for (const volume of unit.volumes) if (!components.some((book) => book.volume === volume)) errors.push(`${unit.label}: ${volume} 도서가 빠진 묶음이 있습니다.`);
			}
		}
		return unique(errors);
	}
	function selectionUnitReady(unit, books) {
		return Array.isArray(unit.candidates) && unit.candidates.length > 0 && validateSelectionUnit(unit, books).length === 0;
	}
	//#endregion
	//#region app/evaluation-criteria.ts
	var requiredPriceArea = "17. 교과용도서의 가격";
	var requiredPriceText = "해당 교과용도서의 내용, 구성, 품질 등을 고려하였을 때 적정한 가격인가?";
	var evaluationPresets = [
		{
			name: "1. 교육과정 부합성",
			items: ["시·도 교육과정의 성격 및 목표에 부합하는가?", "학교 교육과정의 성격 및 목표에 부합하는가?"]
		},
		{
			name: "2. 학습 분량의 적절성",
			items: ["학습 분량이 단원별로 균형 있게 구성되어 있는가?", "학습 분량이 주어진 전체 수업시수에 적절한가?"]
		},
		{
			name: "3. 내용 수준의 적정성",
			items: ["학습자의 학년 수준에 맞는 학습 내용과 활동을 다루고 있는가?", "어려운 개념이나 용어를 이해하기 쉽게 설명하고 있는가?"]
		},
		{
			name: "4. 정확성",
			items: ["개념 및 이론이 정확하고 검증된 자료에 근거하고 있는가?", "지도 및 각종 통계 자료(표, 그래프)가 최신의 것인가?"]
		},
		{
			name: "5. 중립성",
			items: ["인물, 성, 종교, 이념, 민족, 계층, 지역 등과 관련하여 부정적 또는 일방적인 견해 등이 없는가?", "개방적이고 균형적인 관점과 사고를 가질 수 있는 내용을 다루고 있는가?"]
		},
		{
			name: "6. 학습동기 유발",
			items: ["학습자의 흥미를 유발하고 호기심을 자극할 수 있는 내용이나 소재를 다루고 있는가?", "학습자의 창의성을 자극할 수 있도록 내용을 구성하고 있는가?"]
		},
		{
			name: "7. 효과성",
			items: ["학습 요소(학습목표, 도입, 본문, 정리, 그림 및 도표, 참고 자료 등)가 유용하게 구성되어 있는가?", "시각 자료는 학습 내용과 조화를 이루도록 배치되어 있는가?"]
		},
		{
			name: "8. 단원, 학년간 연계 및 계열성",
			items: ["학년간, 학교급간의 연계 및 계열성을 고려하고 있는가?", "목차(대단원, 중단원, 소단원)의 배열 순서가 논리적으로 정렬되어 있는가?"]
		},
		{
			name: "9. 자기 주도적 학습내용",
			items: [
				"학습 내용의 이해를 돕기 위한 참고 자료 및 관련 활동을 다양하게 안내하는가?",
				"학생 수준별로 학습이 가능한 자료를 제시하고 있는가?",
				"학습 단계별(도입, 전개, 정리) 안내 및 지시사항이 명확하고 이해하기 쉬운가?"
			]
		},
		{
			name: "10. 다양한 교수·학습 활동",
			items: ["개별 혹은 소그룹 활동, 미디어 활용 등의 다양한 학습활동 및 방법을 안내하고 있는가?", "학습자의 참여를 증진시키는 다양한 학습활동(토의, 토론, 실험, 실습 등)을 제시하고 있는가?"]
		},
		{
			name: "11. 교수·학습 활동의 유용성",
			items: ["실생활과 관련된 문제 상황을 해결하는 학습활동을 예시하고 있는가?", "학습 주제에 적절하며 실현 가능한 학습활동 및 방법을 제시하고 있는가?"]
		},
		{
			name: "12. 학습 참고 자료의 충실성 및 유용성",
			items: ["교과서의 부속자료(부록, 색인, 용어해설, 찾아보기 등)는 충분하고 유용한가?", "교과서 전시본과 함께 배포된 전자저작물(CD 등)은 충분하고 유용한가?"]
		},
		{
			name: "13. 다양한 평가 활동",
			items: ["학습단계에 맞는 평가 방법(진단, 형성, 총괄 평가 등)을 안내하고 있는가?", "다양한 평가유형(선택형, 서답형, 수행평가 등)을 안내하고 있는가?"]
		},
		{
			name: "14. 종합적 사고력 평가",
			items: ["단순한 지식의 측정만이 아니라 문제해결능력, 논리적 사고력, 창의적 사고력 등을 측정하고 있는가?", "학생 스스로 점검할 수 있는 평가방법을 안내하고 있는가?"]
		},
		{
			name: "15. 표현·표기의 정확성 및 가독성",
			items: ["문장이 명료하며 어법(표준어, 외래어, 띄어쓰기 등)에 맞는가?", "전문 용어, 도량형 표기법 등이 현재 규정에 일치하는가?"]
		},
		{
			name: "16. 편집 디자인 및 내구성",
			items: ["지면 구성(자료 배치, 줄 간격, 여백, 색조 등)이 안정적인가?", "종이의 질 및 제책 상태는 양호한가?"]
		},
		{
			name: requiredPriceArea,
			items: ["동일 교과목 교과용도서를 비교해 보았을 때 가격은 적정한가?", requiredPriceText]
		}
	];
	function normalizeEvaluationCriteria(source) {
		const keywords = [
			["학습 분량", "2. 학습 분량의 적절성"],
			["학년 수준", "3. 내용 수준의 적정성"],
			["창의성", "6. 학습동기 유발"],
			["참고 자료", "9. 자기 주도적 학습내용"],
			["소그룹", "10. 다양한 교수·학습 활동"],
			["평가 방법", "13. 다양한 평가 활동"],
			["사고력", "14. 종합적 사고력 평가"],
			["가격", "17. 교과용도서의 가격"]
		];
		const normalizedCriteria = source.map((c) => {
			var _keywords$find;
			if (evaluationPresets.some((p) => p.name === c.area)) return c;
			const exact = evaluationPresets.find((p) => p.items.includes(c.text));
			const inferred = (_keywords$find = keywords.find(([word]) => c.text.includes(word))) === null || _keywords$find === void 0 ? void 0 : _keywords$find[1];
			return {
				...c,
				area: (exact === null || exact === void 0 ? void 0 : exact.name) || inferred || c.area
			};
		});
		return normalizedCriteria.some((c) => c.area === "17. 교과용도서의 가격") ? normalizedCriteria : [...normalizedCriteria, {
			id: "required-price",
			area: requiredPriceArea,
			text: requiredPriceText,
			max: 10
		}];
	}
	function formTestSource(saved) {
		var _selectionUnits$find;
		const aliases = new Map([...new Set(Object.values(saved.members || {}).flat())].map((name, index) => [name, `예시교사 ${"가나다라마바사아자차카타파하"[index] || index + 1}`]));
		const exampleName = (name, fallback) => name ? aliases.get(name) || fallback : "";
		const members = Object.fromEntries(Object.entries(saved.members || {}).map(([subject, names]) => [subject, names.map((name) => aliases.get(name))]));
		const selectionUnits = migrateLegacyUnits(saved).filter((unit) => unit.status !== "archived").map((unit) => ({
			id: unit.id,
			subject: unit.subject,
			label: unit.label,
			mode: unit.mode,
			volumes: [...unit.volumes],
			status: unit.status,
			candidates: unit.candidates.map(({ id, label, bookIds }) => ({
				id,
				label,
				bookIds: [...bookIds]
			})),
			criteria: normalizeEvaluationCriteria(unit.criteria).map(({ id, area, text, max }) => ({
				id,
				area,
				text,
				max
			})),
			reviews: emptyReviews(members[unit.subject] || []),
			topScore: unit.topScore,
			gap: unit.gap,
			recommendations: {},
			signatures: {},
			opinionSources: {}
		}));
		const source = {
			testOnly: true,
			activeUnitId: "",
			subject: "",
			criteria: [],
			reviews: [],
			topScore: 97,
			gap: 3,
			recommendations: {},
			signatures: {},
			opinionSources: {},
			members,
			departmentHeads: Object.fromEntries(Object.entries(saved.departmentHeads || {}).map(([subject, name]) => [subject, exampleName(name, "예시교과부장")])),
			summaryWriters: Object.fromEntries(Object.entries(saved.summaryWriters || {}).map(([subject, name]) => [subject, exampleName(name, "예시작성자")])),
			books: saved.books.map(({ id, subject, publisher, author, title, volume, price }) => ({
				id,
				subject,
				publisher,
				author,
				title,
				volume,
				price
			})),
			selectionUnits,
			setup: saved.setup ? {
				schoolName: saved.setup.schoolName,
				schoolYear: saved.setup.schoolYear,
				vicePrincipalName: exampleName(saved.setup.vicePrincipalName, "예시교감"),
				managerName: exampleName(saved.setup.managerName, "예시담당자"),
				completedAt: saved.setup.completedAt,
				googleDomain: "",
				managerEmail: "",
				vicePrincipalEmail: "",
				staff: []
			} : void 0
		};
		return selectionUnits.length ? activateSelectionUnit(source, ((_selectionUnits$find = selectionUnits.find((unit) => unit.id === saved.activeUnitId)) === null || _selectionUnits$find === void 0 ? void 0 : _selectionUnits$find.id) || selectionUnits[0].id) : source;
	}
	//#endregion
	//#region apps-script-src/service.ts
	var response = (status, body, write) => ({
		status,
		body,
		write
	});
	var asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
	var text = (value) => typeof value === "string" ? value.trim() : "";
	var nextRevision = (current) => Math.max(Date.now(), current + 1);
	var savedSetup = (value) => asRecord(value === null || value === void 0 ? void 0 : value.setup);
	function loginWithSchoolId(value, config, stored) {
		if (!config.ready || !config.bootstrapManagerId) return response(503, { error: "학교 프로그램의 최초 설정이 필요합니다." });
		const loginId = normalizeSchoolId(value);
		if (!isSchoolLoginId(loginId)) return response(400, { error: "담당자가 발급한 학교 아이디를 정확히 입력해 주세요." });
		const setup = savedSetup(stored.data);
		const identity = (setup === null || setup === void 0 ? void 0 : setup.completedAt) ? setupIdentity(setup, loginId) : null;
		const bootstrap = !(setup === null || setup === void 0 ? void 0 : setup.completedAt) && loginId === config.bootstrapManagerId;
		if (!identity && !bootstrap) return response(403, { error: "등록되지 않은 학교 아이디입니다. 업무담당자에게 확인해 주세요." });
		const user = {
			accountId: `school-id:${loginId}`,
			email: loginId,
			name: (identity === null || identity === void 0 ? void 0 : identity.name) || "업무담당자",
			domain: "school-id",
			loginMethod: "registered-email",
			expiresAt: Date.now() / 1e3 + 21600
		};
		return {
			status: 200,
			body: {
				ok: true,
				user
			},
			user
		};
	}
	function loadWorkspace(user, config, stored) {
		if (!user) return response(401, { error: "학교 아이디 로그인이 필요합니다." });
		if (!stored.data) {
			if (user.email !== config.bootstrapManagerId) return response(403, { error: "초기 설정 권한이 있는 업무담당자 아이디가 아닙니다." });
			return response(200, null);
		}
		const setup = savedSetup(stored.data);
		if ((setup === null || setup === void 0 ? void 0 : setup.completedAt) && !setupIdentity(setup, user.email)) return response(403, { error: "업무담당자가 등록한 학교 아이디가 아닙니다." });
		return response(200, {
			...stored.data,
			workspaceRevision: stored.revision
		});
	}
	function memberMap(value) {
		const source = asRecord(value) || {};
		return Object.fromEntries(Object.entries(source).map(([subject, names]) => [subject, Array.isArray(names) ? names.map(text).filter(Boolean) : []]));
	}
	function stringMap(value) {
		const source = asRecord(value) || {};
		return Object.fromEntries(Object.entries(source).filter((entry) => typeof entry[1] === "string"));
	}
	function saveSetup(user, config, stored, body) {
		var _setupIdentity, _stored$data;
		if (!user) return response(401, { error: "학교 아이디 로그인이 필요합니다." });
		const request = asRecord(body);
		const input = asRecord(request === null || request === void 0 ? void 0 : request.setup);
		const existingSetup = savedSetup(stored.data);
		if (!((existingSetup === null || existingSetup === void 0 ? void 0 : existingSetup.completedAt) ? (_setupIdentity = setupIdentity(existingSetup, user.email)) === null || _setupIdentity === void 0 ? void 0 : _setupIdentity.manager : user.email === config.bootstrapManagerId)) return response(403, { error: "초기 설정 권한이 있는 업무담당자 아이디가 아닙니다." });
		if (!request || !input || !Array.isArray(input.staff)) return response(400, { error: "설정 내용을 확인해 주세요." });
		const submitted = asRecord(request.workspace) || {};
		if (stored.data && typeof submitted.workspaceRevision === "number" && submitted.workspaceRevision !== stored.revision) return response(409, { error: "다른 사용자가 먼저 저장했습니다. 새로고침한 뒤 다시 설정해 주세요." });
		const members = memberMap(submitted.members);
		const heads = stringMap(request.departmentHeads);
		const writers = stringMap(request.summaryWriters);
		const expectedNames = [...new Set(Object.values(members).flat())];
		const staff = input.staff.map((item) => {
			const person = asRecord(item);
			return {
				name: text(person === null || person === void 0 ? void 0 : person.name),
				email: normalizeSchoolId(person === null || person === void 0 ? void 0 : person.email),
				subjects: []
			};
		});
		const setup = {
			schoolName: text(input.schoolName),
			schoolYear: typeof input.schoolYear === "number" ? input.schoolYear : 0,
			googleDomain: "school-id",
			managerName: text(input.managerName),
			managerEmail: normalizeSchoolId(input.managerEmail),
			vicePrincipalName: text(input.vicePrincipalName),
			vicePrincipalEmail: normalizeSchoolId(input.vicePrincipalEmail),
			staff,
			completedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		const ids = staff.map((person) => person.email);
		const names = staff.map((person) => person.name);
		const rolesValid = Object.entries(members).every(([subject, people]) => people.includes(heads[subject]) && people.includes(writers[subject]) && heads[subject] !== writers[subject]);
		const staffValid = expectedNames.length > 0 && staff.length === expectedNames.length && new Set(names).size === names.length && expectedNames.every((name) => names.includes(name)) && ids.every(isSchoolLoginId) && new Set(ids).size === ids.length;
		if (!setup.schoolName || !Number.isInteger(setup.schoolYear) || setup.schoolYear < 2026 || !setup.managerName || setup.managerEmail !== user.email || !isSchoolLoginId(setup.managerEmail) || !setup.vicePrincipalName || !isSchoolLoginId(setup.vicePrincipalEmail) || setup.managerEmail === setup.vicePrincipalEmail || !staffValid || !rolesValid) return response(400, { error: "학교 정보, 교직원 아이디 또는 협의회 역할 설정을 다시 확인해 주세요." });
		setup.staff = staff.map((person) => ({
			...person,
			subjects: Object.keys(members).filter((subject) => members[subject].includes(person.name))
		}));
		const books = Array.isArray(submitted.books) ? submitted.books : [];
		const units = Array.isArray(submitted.selectionUnits) ? submitted.selectionUnits : [];
		if (!books.length || new Set(books.map((book) => book.id)).size !== books.length || books.some((book) => !(book === null || book === void 0 ? void 0 : book.id) || !text(book.subject) || !members[book.subject] || !text(book.publisher) || !text(book.title))) return response(400, { error: "도서·가격 목록을 다시 확인해 주세요." });
		if (!units.length || units.some((unit) => !(unit === null || unit === void 0 ? void 0 : unit.id) || !members[unit.subject] || !selectionUnitReady(unit, books))) return response(400, { error: "과목별 선정 방식과 평가표 구성을 다시 확인해 주세요." });
		const unitErrors = units.flatMap((unit) => validateSelectionUnit(unit, books));
		if (unitErrors.length) return response(400, { error: unitErrors[0] });
		const previousUnits = Array.isArray((_stored$data = stored.data) === null || _stored$data === void 0 ? void 0 : _stored$data.selectionUnits) ? stored.data.selectionUnits : [];
		for (const previous of previousUnits.filter(selectionUnitHasActivity)) {
			const next = units.find((unit) => unit.id === previous.id);
			if (!next || JSON.stringify(previous.candidates) !== JSON.stringify(next.candidates)) return response(409, { error: `${previous.label}은 평가가 시작되어 후보 구성을 바꿀 수 없습니다.` });
		}
		const workspace = {
			...stored.data || {},
			...submitted,
			setup,
			books,
			selectionUnits: units,
			departmentHeads: heads,
			summaryWriters: writers
		};
		delete workspace.workspaceRevision;
		if (JSON.stringify(workspace).length > 9e5) return response(413, { error: "저장 용량을 초과했습니다." });
		const revision = nextRevision(stored.revision);
		return response(200, {
			ok: true,
			data: {
				...workspace,
				workspaceRevision: revision
			}
		}, {
			data: workspace,
			revision
		});
	}
	function stampSignature(next, previous, user) {
		const record = { ...asRecord(next) || {} };
		const old = asRecord(previous) || {};
		if (record.image !== old.image || record.signedAt !== old.signedAt || record.name !== old.name) {
			record.signedAccountId = user.accountId;
			record.signedAccountEmail = user.email;
		} else {
			if (old.signedAccountId) record.signedAccountId = old.signedAccountId;
			if (old.signedAccountEmail) record.signedAccountEmail = old.signedAccountEmail;
		}
		return record;
	}
	function saveWorkspace(user, stored, body) {
		if (!user) return response(401, { error: "학교 아이디 로그인이 필요합니다." });
		const incoming = { ...asRecord(body) || {} };
		if (!stored.data) return response(409, { error: "업무 초기 설정을 먼저 완료해 주세요." });
		if (incoming.testOnly || Array.isArray(incoming.selectionUnits) && incoming.selectionUnits.some((unit) => typeof (unit === null || unit === void 0 ? void 0 : unit.id) === "string" && unit.id.startsWith("form-test:"))) return response(400, { error: "테스트 자료는 실제 업무에 저장할 수 없습니다." });
		const scope = String(incoming._clientScope || "");
		const teacher = typeof incoming._clientTeacher === "string" ? incoming._clientTeacher : "";
		const unitId = typeof incoming._clientUnitId === "string" ? incoming._clientUnitId : "";
		const clientRevision = typeof incoming.workspaceRevision === "number" ? incoming.workspaceRevision : 0;
		delete incoming._clientScope;
		delete incoming._clientTeacher;
		delete incoming._clientUnitId;
		const saved = stored.data;
		const setup = savedSetup(saved);
		const identity = setupIdentity(setup, user.email);
		if (!(setup === null || setup === void 0 ? void 0 : setup.completedAt) || !identity) return response(403, { error: "등록된 학교 아이디가 아닙니다." });
		const incomingUnits = Array.isArray(incoming.selectionUnits) ? incoming.selectionUnits : [];
		const savedUnits = Array.isArray(saved.selectionUnits) ? saved.selectionUnits : [];
		const incomingUnit = incomingUnits.find((unit) => unit.id === unitId);
		const savedUnit = savedUnits.find((unit) => unit.id === unitId);
		if (!incomingUnit || !savedUnit) return response(400, { error: "선정 단위를 찾을 수 없습니다." });
		if (incomingUnit.subject !== savedUnit.subject || savedUnit.status === "archived") return response(409, { error: "선정 단위 정보가 최신 상태와 다릅니다." });
		if ([
			"review",
			"review-reset",
			"unit-review-reset",
			"summary",
			"recommend"
		].includes(scope) && savedUnit.status !== "active") return response(409, { error: "담당자가 평가 후보 구성을 완료한 뒤 작성할 수 있습니다." });
		const subject = savedUnit.subject;
		const heads = asRecord(saved.departmentHeads) || {};
		const writers = asRecord(saved.summaryWriters) || {};
		const isHead = heads[subject] === identity.name;
		const isWriter = writers[subject] === identity.name;
		if (!(identity.manager || (scope === "review" || scope === "review-reset" ? teacher === identity.name && identity.subjects.includes(subject) : scope === "unit-review-reset" ? isHead : scope === "summary" ? isHead || isWriter : scope === "recommend" ? isHead || identity.vicePrincipal : scope === "criteria" && isHead))) return response(403, { error: "이 업무를 변경할 권한이 없습니다." });
		if (scope === "catalog") {
			if (clientRevision !== stored.revision) return response(409, { error: "다른 사용자가 먼저 저장했습니다. 화면을 새로고침한 뒤 다시 저장해 주세요." });
			const books = Array.isArray(incoming.books) ? incoming.books : [];
			const unitErrors = incomingUnits.flatMap((unit) => validateSelectionUnit(unit, books));
			if (unitErrors.length) return response(400, { error: unitErrors[0] });
			for (const previous of savedUnits.filter(selectionUnitHasActivity)) {
				const submitted = incomingUnits.find((unit) => unit.id === previous.id);
				if (!submitted || JSON.stringify(previous.candidates) !== JSON.stringify(submitted.candidates)) return response(409, { error: `${previous.label}은 평가가 시작되어 후보 구성을 직접 바꿀 수 없습니다.` });
			}
			const savedBooks = Array.isArray(saved.books) ? saved.books : [];
			const changedBookIds = new Set(books.filter((book) => {
				const previous = savedBooks.find((item) => item.id === book.id);
				return !previous || previous.subject !== book.subject || previous.volume !== book.volume || previous.publisher !== book.publisher || previous.author !== book.author || previous.title !== book.title || previous.price !== book.price;
			}).map((book) => book.id));
			savedBooks.filter((book) => !books.some((item) => item.id === book.id)).forEach((book) => changedBookIds.add(book.id));
			const selectionUnits = incomingUnits.map((unit) => {
				const changed = unit.candidates.some((candidate) => candidate.bookIds.some((id) => changedBookIds.has(id)));
				return {
					...unit,
					status: selectionUnitReady(unit, books) ? "active" : "draft",
					...changed ? {
						reviews: unit.reviews.map((review) => ({
							...review,
							signed: false,
							signature: void 0
						})),
						signatures: {},
						opinionSources: {}
					} : {}
				};
			});
			const merged = {
				...saved,
				...incoming,
				books,
				selectionUnits,
				setup: saved.setup
			};
			delete merged.workspaceRevision;
			if (JSON.stringify(merged).length > 9e5) return response(413, { error: "저장 용량을 초과했습니다." });
			const revision = nextRevision(stored.revision);
			return response(200, {
				ok: true,
				data: {
					...merged,
					workspaceRevision: revision
				},
				clientRevision
			}, {
				data: merged,
				revision
			});
		}
		let nextUnit = { ...savedUnit };
		if (scope === "review") {
			const own = incomingUnit.reviews.find((review) => review.teacher === teacher);
			const previous = savedUnit.reviews.find((review) => review.teacher === teacher);
			if (!own || !identity.manager && own.teacher !== identity.name) return response(400, { error: "본인의 평가만 저장할 수 있습니다." });
			const signature = asRecord(own.signature);
			const expectedName = identity.manager ? teacher : identity.name;
			if (own.signed && (signature === null || signature === void 0 ? void 0 : signature.name) !== expectedName) return response(400, { error: "로그인한 본인의 이름으로만 서명할 수 있습니다." });
			const candidateIds = new Set(savedUnit.candidates.map((candidate) => candidate.id));
			if (new Set(own.ranked).size !== own.ranked.length || own.ranked.some((id) => !candidateIds.has(id)) || Object.keys(own.scores || {}).some((id) => !candidateIds.has(id))) return response(400, { error: "평가 후보와 순위 정보를 다시 확인해 주세요." });
			const nextReview = { ...own };
			if (nextReview.signed && nextReview.signature) nextReview.signature = stampSignature(nextReview.signature, previous === null || previous === void 0 ? void 0 : previous.signature, user);
			const opinionKey = selectionKey(unitId, `review:${teacher}`);
			nextUnit = {
				...savedUnit,
				reviews: savedUnit.reviews.map((review) => review.teacher === teacher ? nextReview : review),
				opinionSources: {
					...savedUnit.opinionSources,
					...opinionKey in incomingUnit.opinionSources ? { [opinionKey]: incomingUnit.opinionSources[opinionKey] } : {}
				}
			};
		} else if (scope === "review-reset") {
			if (!savedUnit.reviews.some((review) => review.teacher === teacher)) return response(400, { error: "초기화할 평가를 찾을 수 없습니다." });
			const sources = { ...savedUnit.opinionSources };
			delete sources[selectionKey(unitId, `review:${teacher}`)];
			nextUnit = {
				...savedUnit,
				reviews: savedUnit.reviews.map((review) => review.teacher === teacher ? resetReview(review) : review),
				signatures: {},
				opinionSources: sources
			};
		} else if (scope === "unit-review-reset") nextUnit = resetSelectionUnitEvaluation(savedUnit);
		else if (scope === "criteria") {
			const criterionIds = new Set(incomingUnit.criteria.map((criterion) => criterion.id));
			nextUnit = {
				...savedUnit,
				criteria: incomingUnit.criteria,
				topScore: incomingUnit.topScore,
				gap: incomingUnit.gap,
				reviews: savedUnit.reviews.map((review) => ({
					...review,
					scores: Object.fromEntries(Object.entries(review.scores || {}).flatMap(([candidateId, values]) => {
						const kept = Object.fromEntries(Object.entries(values).filter(([criterionId]) => criterionIds.has(criterionId)));
						return Object.keys(kept).length ? [[candidateId, kept]] : [];
					})),
					signed: false,
					signature: void 0
				})),
				signatures: {},
				opinionSources: {}
			};
		} else if (scope === "summary" || scope === "recommend") {
			const signatures = { ...savedUnit.signatures };
			const offered = asRecord(incomingUnit.signatures) || {};
			const targets = scope === "summary" ? identity.manager ? [[selectionKey(unitId, "summary:writer"), text(writers[subject])], [selectionKey(unitId, "summary:checker"), text(heads[subject])]] : [[selectionKey(unitId, `summary:${isHead ? "checker" : "writer"}`), identity.name]] : identity.manager ? [[selectionKey(unitId, "recommend:writer"), text(heads[subject])], [selectionKey(unitId, "recommend:approver"), setup.vicePrincipalName]] : [[selectionKey(unitId, `recommend:${identity.vicePrincipal && !isHead ? "approver" : "writer"}`), identity.vicePrincipal && !isHead ? setup.vicePrincipalName : identity.name]];
			for (const [key, expectedName] of targets) {
				const hasNext = key in offered;
				if (!(hasNext ? JSON.stringify(offered[key]) !== JSON.stringify(signatures[key]) : key in signatures)) continue;
				const nextSignature = asRecord(offered[key]);
				if (hasNext && (!expectedName || (nextSignature === null || nextSignature === void 0 ? void 0 : nextSignature.name) !== expectedName)) return response(400, { error: "지정된 서명자 이름으로만 서명할 수 있습니다." });
				if (hasNext) signatures[key] = stampSignature(offered[key], signatures[key], user);
				else delete signatures[key];
			}
			if (scope === "recommend" && (identity.manager || isHead)) {
				if (Object.keys(incomingUnit.recommendations || {}).some((id) => !savedUnit.candidates.some((candidate) => candidate.id === id))) return response(400, { error: "추천 도서 정보를 다시 확인해 주세요." });
				if (JSON.stringify(savedUnit.recommendations) !== JSON.stringify(incomingUnit.recommendations)) {
					delete signatures[selectionKey(unitId, "recommend:writer")];
					delete signatures[selectionKey(unitId, "recommend:approver")];
				}
				nextUnit = {
					...savedUnit,
					recommendations: incomingUnit.recommendations,
					opinionSources: incomingUnit.opinionSources,
					signatures
				};
			} else nextUnit = {
				...savedUnit,
				signatures
			};
		} else return response(400, { error: "저장 범위를 확인해 주세요." });
		const selectionUnits = savedUnits.map((unit) => unit.id === unitId ? nextUnit : unit);
		const merged = {
			...saved,
			selectionUnits,
			activeUnitId: unitId,
			subject: nextUnit.subject,
			criteria: nextUnit.criteria,
			reviews: nextUnit.reviews,
			topScore: nextUnit.topScore,
			gap: nextUnit.gap,
			recommendations: nextUnit.recommendations,
			signatures: nextUnit.signatures,
			opinionSources: nextUnit.opinionSources
		};
		if (JSON.stringify(merged).length > 9e5) return response(413, { error: "저장 용량을 초과했습니다." });
		const revision = nextRevision(stored.revision);
		return response(200, {
			ok: true,
			data: {
				...merged,
				workspaceRevision: revision
			},
			clientRevision
		}, {
			data: merged,
			revision
		});
	}
	function loadFormTest(user, stored) {
		var _setupIdentity2;
		if (!user) return response(401, { error: "학교 아이디 로그인이 필요합니다." });
		const setup = savedSetup(stored.data);
		if (!stored.data || !(setup === null || setup === void 0 ? void 0 : setup.completedAt)) return response(409, { error: "업무 초기 설정을 완료한 뒤 서식 테스트를 사용할 수 있습니다." });
		if (!((_setupIdentity2 = setupIdentity(setup, user.email)) === null || _setupIdentity2 === void 0 ? void 0 : _setupIdentity2.manager)) return response(403, { error: "서식 테스트는 업무담당자만 사용할 수 있습니다." });
		return response(200, formTestSource(stored.data));
	}
	//#endregion
	//#region apps-script-src/server.ts
	var DATA_SHEET = "_APP_DATA";
	var CHUNK_SIZE = 4e4;
	var SESSION_SECONDS = 21600;
	function properties() {
		return PropertiesService.getScriptProperties();
	}
	function config() {
		const props = properties();
		const manager = normalizeSchoolId(props.getProperty("BOOTSTRAP_MANAGER_ID"));
		const spreadsheetId = props.getProperty("DATABASE_SPREADSHEET_ID") || "";
		return {
			ready: Boolean(manager && spreadsheetId),
			schoolName: props.getProperty("SCHOOL_NAME") || "학교",
			bootstrapManagerId: manager
		};
	}
	function spreadsheet() {
		const id = properties().getProperty("DATABASE_SPREADSHEET_ID");
		if (!id) throw new Error("학교 프로그램의 데이터 스프레드시트를 먼저 설정해 주세요.");
		return SpreadsheetApp.openById(id);
	}
	function dataSheet() {
		const book = spreadsheet();
		let sheet = book.getSheetByName(DATA_SHEET);
		if (!sheet) {
			sheet = book.insertSheet(DATA_SHEET);
			sheet.getRange(1, 1, 1, 4).setValues([[
				"type",
				"index",
				"content",
				"revision"
			]]);
			sheet.hideSheet();
		}
		return sheet;
	}
	function readWorkspaceRecord() {
		if (!config().ready) return {
			data: null,
			revision: 0
		};
		const sheet = dataSheet();
		if (sheet.getLastRow() < 2) return {
			data: null,
			revision: 0
		};
		const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().filter((row) => row[0] === "workspace").sort((a, b) => Number(a[1]) - Number(b[1]));
		if (!rows.length) return {
			data: null,
			revision: 0
		};
		const value = rows.map((row) => String(row[2] || "")).join("");
		return {
			data: value ? JSON.parse(value) : null,
			revision: Number(rows[0][3]) || 0
		};
	}
	function writeWorkspaceRecord(data, revision) {
		const sheet = dataSheet();
		const value = JSON.stringify(data);
		const rows = [];
		for (let offset = 0, index = 0; offset < value.length; offset += CHUNK_SIZE, index++) rows.push([
			"workspace",
			index,
			value.slice(offset, offset + CHUNK_SIZE),
			revision
		]);
		if (!rows.length) rows.push([
			"workspace",
			0,
			"{}",
			revision
		]);
		const existing = Math.max(0, sheet.getLastRow() - 1);
		if (existing) sheet.getRange(2, 1, existing, 4).clearContent();
		sheet.getRange(2, 1, rows.length, 4).setValues(rows);
	}
	function sessionCache() {
		return CacheService.getScriptCache();
	}
	function sessionUser(token) {
		if (typeof token !== "string" || !token) return null;
		const value = sessionCache().get(`session:${token}`);
		if (!value) return null;
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	function createSession(user) {
		const token = `${Utilities.getUuid()}${Utilities.getUuid()}`.replace(/-/g, "");
		sessionCache().put(`session:${token}`, JSON.stringify(user), SESSION_SECONDS);
		return token;
	}
	function result(value) {
		if (value.write) writeWorkspaceRecord(value.write.data, value.write.revision);
		return {
			status: value.status,
			body: value.body
		};
	}
	function apiDispatch(request) {
		const input = request && typeof request === "object" ? request : {};
		const path = String(input.path || "");
		const method = String(input.method || "GET").toUpperCase();
		if (path === "/api/config") {
			const current = config();
			return {
				status: 200,
				body: {
					ready: current.ready,
					schoolName: current.schoolName
				}
			};
		}
		if (path === "/api/auth/login" && method === "POST") {
			var _input$body$loginId, _input$body, _input$body2;
			const stored = readWorkspaceRecord();
			const value = loginWithSchoolId((_input$body$loginId = (_input$body = input.body) === null || _input$body === void 0 ? void 0 : _input$body.loginId) !== null && _input$body$loginId !== void 0 ? _input$body$loginId : (_input$body2 = input.body) === null || _input$body2 === void 0 ? void 0 : _input$body2.email, config(), stored);
			if (value.user) value.body.token = createSession(value.user);
			return result(value);
		}
		if (path === "/api/auth/logout" && method === "POST") {
			if (typeof input.token === "string") sessionCache().remove(`session:${input.token}`);
			return {
				status: 200,
				body: { ok: true }
			};
		}
		const user = sessionUser(input.token);
		if (path === "/api/workspace" && method === "GET") return result(loadWorkspace(user, config(), readWorkspaceRecord()));
		if (path === "/api/form-test" && method === "GET") return result(loadFormTest(user, readWorkspaceRecord()));
		if (path === "/api/setup" && method === "POST" || path === "/api/workspace" && method === "PUT") {
			const lock = LockService.getScriptLock();
			if (!lock.tryLock(1e4)) return {
				status: 503,
				body: { error: "다른 저장 작업을 처리 중입니다. 잠시 뒤 다시 저장해 주세요." }
			};
			try {
				const stored = readWorkspaceRecord();
				return result(path === "/api/setup" ? saveSetup(user, config(), stored, input.body) : saveWorkspace(user, stored, input.body));
			} finally {
				lock.releaseLock();
			}
		}
		return {
			status: 404,
			body: { error: "요청한 기능을 찾을 수 없습니다." }
		};
	}
	function bundledHtml() {
		const source = HtmlService.createHtmlOutputFromFile("Index").getContent().replace(/<!--[\s\S]*?-->/g, "").trim();
		const match = /^<pre id="app-bundle">([A-Za-z0-9+/=\s]+)<\/pre>$/.exec(source);
		if (!match) throw new Error("Incomplete Index.html");
		const encoded = match[1].replace(/\s/g, "");
		const blob = Utilities.newBlob(Utilities.base64Decode(encoded), "application/x-gzip", "app.html.gz");
		return Utilities.ungzip(blob).getDataAsString("UTF-8");
	}
	function doGet() {
		let html;
		try {
			html = bundledHtml();
		} catch {
			html = "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"></head><body style=\"font-family:sans-serif;padding:32px;line-height:1.7\"><h1>설치 파일을 확인해 주세요</h1><p>화면 파일을 불러오지 못했습니다. 업무담당자는 같은 압축파일에 들어 있는 Code.gs와 Index.html의 전체 내용을 다시 붙여 넣고 저장한 뒤 새 버전으로 배포해 주세요.</p></body></html>";
		}
		return HtmlService.createHtmlOutput(html).setTitle("교과용도서 선정").addMetaTag("viewport", "width=device-width, initial-scale=1");
	}
	function verifyInstallation() {
		const report = {
			sourceLength: HtmlService.createHtmlOutputFromFile("Index").getContent().length,
			complete: false,
			htmlLength: 0,
			error: ""
		};
		try {
			const html = bundledHtml();
			report.htmlLength = html.length;
			report.complete = html.startsWith("<!doctype html>") && html.trim().endsWith("</html>");
		} catch (error) {
			report.error = error instanceof Error ? error.message : String(error);
		}
		console.log(JSON.stringify(report));
		return report;
	}
	function initializeSchool(spreadsheetId, schoolName, managerId) {
		const id = normalizeSchoolId(managerId);
		if (!spreadsheetId || !(schoolName === null || schoolName === void 0 ? void 0 : schoolName.trim()) || !isSchoolLoginId(id)) throw new Error("스프레드시트 ID, 학교명, 최초 업무담당자 아이디를 확인해 주세요.");
		SpreadsheetApp.openById(spreadsheetId);
		properties().setProperties({
			DATABASE_SPREADSHEET_ID: spreadsheetId,
			SCHOOL_NAME: schoolName.trim(),
			BOOTSTRAP_MANAGER_ID: id
		});
		dataSheet();
		return {
			ok: true,
			schoolName: schoolName.trim(),
			managerId: id
		};
	}
	function configureSchool() {
		const book = SpreadsheetApp.getActiveSpreadsheet();
		if (!book) throw new Error("배포용 스프레드시트에서 이 기능을 실행해 주세요.");
		const ui = SpreadsheetApp.getUi();
		const school = ui.prompt("학교 프로그램 설정", "로그인 화면에 표시할 학교명을 입력하세요.", ui.ButtonSet.OK_CANCEL);
		if (school.getSelectedButton() !== ui.Button.OK) return;
		const manager = ui.prompt("최초 업무담당자", "담당자가 사용할 아이디를 입력하세요. 예: manager", ui.ButtonSet.OK_CANCEL);
		if (manager.getSelectedButton() !== ui.Button.OK) return;
		initializeSchool(book.getId(), school.getResponseText(), manager.getResponseText());
		ui.alert("설정 완료", "이제 Apps Script를 웹 앱으로 배포하고 담당자 아이디로 접속하세요.", ui.ButtonSet.OK);
	}
	function onOpen() {
		SpreadsheetApp.getUi().createMenu("교과서 선정 프로그램").addItem("최초 학교 설정", "configureSchool").addToUi();
	}
	//#endregion
	exports.apiDispatch = apiDispatch;
	exports.configureSchool = configureSchool;
	exports.doGet = doGet;
	exports.initializeSchool = initializeSchool;
	exports.onOpen = onOpen;
	exports.verifyInstallation = verifyInstallation;
	return exports;
})({});


function doGet(e) { return TextbookSelectionGas.doGet(e); }
function apiDispatch(request) { return TextbookSelectionGas.apiDispatch(request); }
function initializeSchool(spreadsheetId, schoolName, managerId) { return TextbookSelectionGas.initializeSchool(spreadsheetId, schoolName, managerId); }
function configureSchool() { return TextbookSelectionGas.configureSchool(); }
function onOpen(e) { return TextbookSelectionGas.onOpen(e); }
function verifyInstallation() { return TextbookSelectionGas.verifyInstallation(); }
