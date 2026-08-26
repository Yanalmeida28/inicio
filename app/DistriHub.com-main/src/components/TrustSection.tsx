import { ArrowRight, BadgeCheck, ClipboardList, Clock3 } from 'lucide-react';

export function TrustSection() {
  return (
    <section className="trust-section" id="como-funciona">
      <div className="page-container trust-inner">
        <div className="trust-copy">
          <span className="section-kicker">Feito para quem faz acontecer</span>
          <h2>
            Seu tempo vale mais.
            <br />
            <em>Seu estoque também.</em>
          </h2>
          <p>
            Do pedido à sua bancada, a DistriHub simplifica cada etapa para você focar no
            que realmente importa: atender bem.
          </p>
          <a className="text-button" href="#ajuda">
            Conheça a DistriHub <ArrowRight size={16} />
          </a>
        </div>
        <div className="trust-points">
          <div>
            <span className="trust-point-icon">
              <Clock3 size={20} />
            </span>
            <h3>Agilidade de verdade</h3>
            <p>Pedido simples, atendimento rápido e envio sem enrolação.</p>
          </div>
          <div>
            <span className="trust-point-icon">
              <BadgeCheck size={20} />
            </span>
            <h3>Peças confiáveis</h3>
            <p>Produtos selecionados e testados para sua tranquilidade.</p>
          </div>
          <div>
            <span className="trust-point-icon">
              <ClipboardList size={20} />
            </span>
            <h3>Compra inteligente</h3>
            <p>Preços competitivos e condições para o seu volume.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
