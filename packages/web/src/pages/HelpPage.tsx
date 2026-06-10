import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HELP_SECTIONS, HELP_GROUPS } from '../docs/helpContent';
import { docsAssetUrl, type HelpSection } from '../docs/helpTypes';
import { useAuthStore } from '../store/authStore';
import { isDesktopRuntime } from '../utils/runtime';

function sectionMatches(section: HelpSection, needle: string): boolean {
	if (!needle) return true;
	const haystack = [
		section.title,
		section.intro,
		...(section.tips ?? []),
		...section.actions.flatMap((action) => [action.title, ...action.steps]),
	]
		.join(' ')
		.toLowerCase();
	return haystack.includes(needle);
}

function HelpScreenshot({ section }: { section: HelpSection }) {
	const [failed, setFailed] = useState(false);
	if (!section.screenshot || failed) return null;
	return (
		<a
			href={docsAssetUrl(section.screenshot)}
			target="_blank"
			rel="noreferrer"
			className="mt-4 block overflow-hidden rounded-xl border border-gray-200 shadow-sm transition-shadow hover:shadow-md"
			title="Open full-size screenshot"
		>
			<img
				src={docsAssetUrl(section.screenshot)}
				alt={`Screenshot of ${section.title}`}
				loading="lazy"
				className="w-full"
				onError={() => setFailed(true)}
			/>
		</a>
	);
}

export default function HelpPage() {
	const { user } = useAuthStore();
	const [query, setQuery] = useState('');
	const needle = query.trim().toLowerCase();
	const isDesktop = isDesktopRuntime();

	const visibleSections = useMemo(
		() =>
			HELP_SECTIONS.filter((section) => {
				if (section.group === 'Desktop' && !isDesktop) return false;
				if (section.roles && user?.role && !section.roles.includes(user.role)) return false;
				return sectionMatches(section, needle);
			}),
		[needle, user?.role, isDesktop]
	);

	const groupedSections = useMemo(
		() =>
			HELP_GROUPS.map((group) => ({
				group,
				sections: visibleSections.filter((section) => section.group === group),
			})).filter(({ sections }) => sections.length > 0),
		[visibleSections]
	);

	const scrollTo = (id: string) => {
		document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="page-header mb-0">
				<div className="page-header-left">
					<h1 className="page-title">Help & Documentation</h1>
					<p className="page-subtitle">
						Step-by-step guides with screenshots for every page and action in the app.
					</p>
				</div>
				<div className="w-full max-w-xs">
					<input
						className="input-field"
						placeholder="Search the docs…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label="Search documentation"
					/>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
				<aside className="content-section mb-0 hidden self-start xl:block xl:sticky xl:top-4">
					<div className="content-section-header">
						<h2 className="section-title mb-0">Contents</h2>
					</div>
					<div className="max-h-[70vh] overflow-y-auto p-3">
						{groupedSections.map(({ group, sections }) => (
							<div key={group} className="mb-4 last:mb-0">
								<div className="px-2 pb-2 text-xs font-semibold uppercase text-gray-500">{group}</div>
								<div className="flex flex-col gap-1">
									{sections.map((section) => (
										<button
											type="button"
											key={section.id}
											onClick={() => scrollTo(section.id)}
											className="rounded-lg px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
										>
											{section.title}
										</button>
									))}
								</div>
							</div>
						))}
						{groupedSections.length === 0 && (
							<p className="px-2 text-sm text-gray-500">No topics match your search.</p>
						)}
					</div>
				</aside>

				<div className="flex min-w-0 flex-col gap-4">
					{groupedSections.map(({ group, sections }) => (
						<div key={group}>
							<h2 className="mb-3 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</h2>
							<div className="flex flex-col gap-4">
								{sections.map((section) => (
									<section key={section.id} id={`help-${section.id}`} className="content-section mb-0 scroll-mt-4 p-5">
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
												{section.roles && (
													<p className="mt-0.5 text-xs text-gray-500">
														Available to: {section.roles.join(', ')}
													</p>
												)}
											</div>
											{section.route && (
												<Link to={section.route} className="btn-secondary btn-sm">
													Open page →
												</Link>
											)}
										</div>
										<p className="mt-2 text-sm leading-relaxed text-gray-600">{section.intro}</p>

										<HelpScreenshot section={section} />

										<div className="mt-4 flex flex-col gap-4">
											{section.actions.map((action) => (
												<div key={action.title}>
													<h4 className="text-sm font-semibold text-gray-800">{action.title}</h4>
													<ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-600">
														{action.steps.map((step, index) => (
															<li key={index}>{step}</li>
														))}
													</ol>
												</div>
											))}
										</div>

										{section.tips && section.tips.length > 0 && (
											<div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
												{section.tips.map((tip, index) => (
													<p key={index} className="text-sm text-blue-800">
														💡 {tip}
													</p>
												))}
											</div>
										)}
									</section>
								))}
							</div>
						</div>
					))}

					{groupedSections.length === 0 && (
						<div className="content-section mb-0 p-8 text-center text-sm text-gray-500">
							Nothing in the docs matches “{query}”. Try a different term.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
