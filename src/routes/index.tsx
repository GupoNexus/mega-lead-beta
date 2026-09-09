import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Check, Download, MapPinned, MessageCircleMore, ShieldCheck, Workflow } from 'lucide-react';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Mega Lead Beta — Prospecção e WhatsApp em um só lugar' },
    { name: 'description', content: 'Extraia leads do Google Maps, organize seu CRM e converse pelo WhatsApp. Cadastre-se para testar o Mega Lead Beta no Windows.' },
  ]}), component: Landing,
});

const plans = [
  { name: 'Mensal', price: '99', note: 'por mês', featured: false },
  { name: 'Trimestral', price: '197', note: 'a cada 3 meses', featured: true, badge: 'Mais escolhido' },
  { name: 'Anual', price: '497', note: 'por ano', featured: false },
];

function Landing() { return <div className="marketing-site">
  <header className="marketing-header">
    <Link to="/" className="marketing-logo"><span>m.</span><b>mega lead</b></Link>
    <nav aria-label="Navegação do site"><a href="#recursos">Recursos</a><a href="#planos">Planos</a><a href="#beta">Beta</a></nav>
    <div className="marketing-actions"><Link to="/auth" className="text-link">Entrar</Link><a href="/auth?mode=signup" className="primary-small">Testar grátis</a></div>
  </header>
  <main>
    <section className="marketing-hero">
      <div className="hero-copy"><span className="beta-pill">Beta aberto para testes</span><h1>Encontre empresas.<br/><em>Comece conversas.</em></h1><p>Extraia contatos do Google Maps, organize seus leads e fale pelo WhatsApp sem sair da mesma ferramenta.</p><div className="hero-actions"><a href="/auth?mode=signup" className="hero-primary">Criar conta e baixar <ArrowRight size={18}/></a><a href="#recursos" className="hero-secondary">Conhecer o Mega Lead</a></div><small>Versão para Windows · acesso beta sem cobrança</small></div>
      <div className="product-stage" aria-label="Fluxo principal do Mega Lead"><div className="stage-top"><span>MEGA LEAD</span><b>BETA</b></div><div className="stage-flow"><article><MapPinned/><small>1. Prospecção</small><strong>Leads encontrados</strong><span>Google Maps</span></article><i>→</i><article><Workflow/><small>2. Organização</small><strong>Funil de vendas</strong><span>CRM visual</span></article><i>→</i><article><MessageCircleMore/><small>3. Conversa</small><strong>WhatsApp integrado</strong><span>Individual ou em lote</span></article></div><div className="stage-result"><span>Seu fluxo de prospecção em uma única tela</span><b>Pronto para começar</b></div></div>
    </section>
    <section id="recursos" className="marketing-section resources-section"><div className="section-heading"><span>Fluxo simples</span><h2>Da busca à conversa, sem trocar de ferramenta</h2><p>O essencial para encontrar, organizar e abordar novos clientes.</p></div><div className="resource-grid">
      <article><MapPinned/><h3>Prospecção no Google Maps</h3><p>Busque por segmento, estado, cidade ou bairro e reúna empresas com telefone.</p></article><article><Workflow/><h3>CRM para acompanhar</h3><p>Organize oportunidades no funil e mova os leads entre as etapas.</p></article><article><MessageCircleMore/><h3>WhatsApp na mesma tela</h3><p>Converse, receba respostas e prepare disparos com delays e lotes.</p></article><article><ShieldCheck/><h3>Dados sob seu controle</h3><p>Exporte a lista, descarte contatos e use sua própria conexão e chave do Google.</p></article>
    </div></section>
    <section id="planos" className="marketing-section plans-section"><div className="section-heading light"><span>Planos previstos</span><h2>Escolha o período que combina com seu ritmo</h2><p>Durante o beta, o acesso está liberado para testes. A cobrança será ativada somente depois da validação.</p></div><div className="plans-grid">{plans.map(plan => <article key={plan.name} className={plan.featured ? 'featured' : ''}>{plan.badge && <b className="plan-badge">{plan.badge}</b>}<h3>{plan.name}</h3><div className="price"><sup>R$</sup><strong>{plan.price}</strong></div><p>{plan.note}</p><ul><li><Check/>Extração de leads</li><li><Check/>CRM completo</li><li><Check/>Central WhatsApp</li><li><Check/>Exportação CSV</li></ul><a href="/auth?mode=signup">Participar do beta</a></article>)}</div></section>
    <section id="beta" className="beta-section"><div><span>Ajude a construir o Mega Lead</span><h2>Teste a ferramenta antes do lançamento</h2><p>Crie sua conta, baixe a versão para Windows e use os fluxos reais. Seu teste vai nos ajudar a encontrar bugs e preparar uma versão mais estável.</p></div><a href="/auth?mode=signup"><Download size={19}/> Criar conta e baixar</a></section>
  </main>
  <footer className="marketing-footer"><div className="marketing-logo"><span>m.</span><b>mega lead</b></div><p>Prospecção e conversas em um só lugar.</p><nav><Link to="/termos">Termos</Link><Link to="/politica-de-privacidade">Privacidade</Link><a href="mailto:grupohuback@gmail.com">Contato</a></nav></footer>
</div> }
