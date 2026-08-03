// Jina metadata extraction — two profiles + fuzzy routing.
// Issue: context-v/issues/Jina-Metadata-Parser-Is-Blog-Only-Needs-Two-Profiles-And-Routing.md
//
// Pure extraction, no network: feeds representative Jina `data` objects (the
// academic fixture is the REAL metadata block captured live from a Springer
// article) through detectProfile + extractBib and asserts the routing and the
// resolved bibliographic fields.

import { describe, expect, test } from 'vitest';
import { detectProfile, extractBib } from '../src/jina';

// Real metadata captured live from r.jina.ai for
// https://link.springer.com/article/10.1007/s12033-023-00765-4
const academic = {
  title: 'Quantum Computing in the Next-Generation Computational Biology Landscape: From Protein Folding to Molecular Dynamics',
  content: '# Quantum Computing …\n\nbody text',
  // Jina's top-level convenience fields come back undefined for scholarly pages:
  publishedTime: undefined,
  author: undefined,
  metadata: {
    citation_title: 'Quantum Computing in the Next-Generation Computational Biology Landscape: From Protein Folding to Molecular Dynamics',
    citation_author: ['Pal, Soumen', 'Bhattacharya, Manojit', 'Lee, Sang-Soo', 'Chakraborty, Chiranjib'],
    'dc.creator': ['Pal, Soumen', 'Bhattacharya, Manojit', 'Lee, Sang-Soo', 'Chakraborty, Chiranjib'],
    citation_publisher: 'Springer US',
    'dc.publisher': 'Springer',
    'dc.date': '2023-05-27',
    'prism.publicationDate': '2023-05-27',
    citation_publication_date: '2024/02',
    citation_journal_title: 'Molecular Biotechnology',
    citation_doi: '10.1007/s12033-023-00765-4',
    DOI: '10.1007/s12033-023-00765-4',
    'og:site_name': 'SpringerLink',
    citation_language: 'en',
  },
};

const blog = {
  title: 'Why We Rebuilt Our Pipeline',
  content: '# Why We Rebuilt Our Pipeline\n\nbody',
  metadata: {
    'og:type': 'article',
    'article:published_time': '2025-01-15T10:00:00Z',
    'article:author': 'Jane Doe',
    'og:site_name': 'Cool Engineering Blog',
    'og:description': 'A story about our rebuild.',
  },
};

const company = {
  title: 'Acme — Industrial Robotics',
  content: '# Acme\n\nWe build robots.',
  metadata: {
    'og:type': 'website',
    'og:site_name': 'Acme Inc',
    'og:description': 'Industrial robotics for the modern factory.',
  },
};

const URL_ACADEMIC = 'https://link.springer.com/article/10.1007/s12033-023-00765-4';

describe('detectProfile — routes by source kind', () => {
  test('academic article → structured / academic-paper', () => {
    expect(detectProfile(academic)).toEqual({ profile: 'structured', kind: 'academic-paper' });
  });
  test('blog post → opengraph / article', () => {
    expect(detectProfile(blog)).toEqual({ profile: 'opengraph', kind: 'article' });
  });
  test('company landing → opengraph / company-landing', () => {
    expect(detectProfile(company)).toEqual({ profile: 'opengraph', kind: 'company-landing' });
  });
});

describe('extractBib — structured profile (academic)', () => {
  const { title, extra } = extractBib(academic, URL_ACADEMIC);
  test('title from citation_title', () => {
    expect(title).toContain('Quantum Computing in the Next-Generation');
  });
  test('all four authors, as an array, un-split', () => {
    expect(extra.authors).toEqual(['Pal, Soumen', 'Bhattacharya, Manojit', 'Lee, Sang-Soo', 'Chakraborty, Chiranjib']);
  });
  test('publisher prefers citation_publisher over og:site_name', () => {
    expect(extra.publisher).toBe('Springer US');
  });
  test('date resolves from dc.date (the field the old parser missed)', () => {
    expect(String(extra.published_at)).toMatch(/^2023-05-27/);
  });
  test('carries kind, profile, doi, journal', () => {
    expect(extra.source_kind).toBe('academic-paper');
    expect(extra.parser_profile).toBe('structured');
    expect(extra.doi).toBe('10.1007/s12033-023-00765-4');
    expect(extra.journal).toBe('Molecular Biotechnology');
  });
});

describe('extractBib — opengraph profile', () => {
  test('blog: author + date + publisher', () => {
    const { extra } = extractBib(blog, 'https://blog.example.com/rebuild');
    expect(extra.authors).toEqual(['Jane Doe']);
    expect(String(extra.published_at)).toMatch(/^2025-01-15/);
    expect(extra.publisher).toBe('Cool Engineering Blog');
    expect(extra.source_kind).toBe('article');
  });
  test('company landing: publisher + description, NO date (none exists)', () => {
    const { extra } = extractBib(company, 'https://acme.example.com');
    expect(extra.publisher).toBe('Acme Inc');
    expect(extra.description).toBe('Industrial robotics for the modern factory.');
    expect(extra.published_at).toBeUndefined();
    expect(extra.source_kind).toBe('company-landing');
  });
});

describe('forceProfile — the manual re-route override', () => {
  test('forcing structured overrides the routed opengraph profile', () => {
    const { extra } = extractBib(blog, 'https://blog.example.com/rebuild', { forceProfile: 'structured' });
    expect(extra.parser_profile).toBe('structured');
  });
});
