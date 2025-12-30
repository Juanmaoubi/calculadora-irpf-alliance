// --- Constantes y Configuración ---
const CONFIG = {
    COTIZACION_SS: {
        COMUNES: 0.047,
        DESEMPLEO: 0.0155,
        FORMACION: 0.0010,
        get TOTAL() { return this.COMUNES + this.DESEMPLEO + this.FORMACION; },
        BASE_MIN: 15876,
        BASE_MAX: 56646
    },
    IRPF: {
        GASTOS_DEDUCIBLES_BASE: 2000, // Norma general pero la simplificada usa fórmula
        MINIMO_PERSONAL: 5550,
        MINIMO_DISCAPACIDAD: {
            "33": 3000,
            "65": 9000
        },
        MINIMO_DESCENDIENTES: [0, 2400, 2700, 4000, 4500], // 0, 1º, 2º, 3º, 4º y siguientes
        TRAMOS_ESTATAL: [
            { limite: 0, tipo: 0.095 }, { limite: 12450, tipo: 0.12 },
            { limite: 20200, tipo: 0.15 }, { limite: 35200, tipo: 0.185 },
            { limite: 60000, tipo: 0.225 }, { limite: 300000, tipo: 0.235 }
        ]
    }
};

// --- Datos de tramos autonómicos 2024 ---
const tramosAutonomicos = {
    estatal: CONFIG.IRPF.TRAMOS_ESTATAL, // Fallback a estatal
    madrid: [
        { limite: 0, tipo: 0.09 }, { limite: 12450, tipo: 0.115 },
        { limite: 17707.20, tipo: 0.15 }, { limite: 20200, tipo: 0.184 },
        { limite: 35200, tipo: 0.234 }, { limite: 60000, tipo: 0.254 }
    ],
    cataluna: [
        { limite: 0, tipo: 0.12 }, { limite: 12450, tipo: 0.14 },
        { limite: 17707.20, tipo: 0.185 }, { limite: 20200, tipo: 0.212 },
        { limite: 35200, tipo: 0.237 }, { limite: 60000, tipo: 0.255 },
        { limite: 120000, tipo: 0.26 }
    ],
    andalucia: [
        { limite: 0, tipo: 0.096 }, { limite: 12450, tipo: 0.12 },
        { limite: 20200, tipo: 0.15 }, { limite: 35200, tipo: 0.185 },
        { limite: 60000, tipo: 0.225 }, { limite: 130000, tipo: 0.245 }
    ],
    valencia: [
        { limite: 0, tipo: 0.099 }, { limite: 12450, tipo: 0.12 },
        { limite: 20200, tipo: 0.14 }, { limite: 35200, tipo: 0.185 },
        { limite: 60000, tipo: 0.221 }
    ],
    galicia: [
        { limite: 0, tipo: 0.091 }, { limite: 12450, tipo: 0.119 },
        { limite: 20200, tipo: 0.15 }, { limite: 35200, tipo: 0.185 },
        { limite: 60000, tipo: 0.225 }
    ],
    paisvasco: [
        { limite: 0, tipo: 0.09 }, { limite: 13500, tipo: 0.12 },
        { limite: 21000, tipo: 0.15 }, { limite: 37000, tipo: 0.196 },
        { limite: 53500, tipo: 0.225 }
    ],
    castillaleon: [
        { limite: 0, tipo: 0.095 }, { limite: 12450, tipo: 0.12 },
        { limite: 20200, tipo: 0.15 }, { limite: 35200, tipo: 0.185 },
        { limite: 60000, tipo: 0.225 }
    ]
};

// --- Elementos del DOM ---
const salarioBrutoInput = document.getElementById('salarioBruto');
const situacionFamiliarSelect = document.getElementById('situacionFamiliar');
const hijosInput = document.getElementById('hijos');
const discapacidadSelect = document.getElementById('discapacidad');
const pagasSelect = document.getElementById('pagas');
const comunidadAutonomaSelect = document.getElementById('comunidadAutonoma');

const salarioNetoDisplay = document.getElementById('salarioNeto');
const salarioNetoAnualDisplay = document.getElementById('salarioNetoAnual');
const retencionPorcentajeDisplay = document.getElementById('retencionPorcentaje');

const resumenBrutoDisplay = document.getElementById('resumenBruto');
const resumenSSDisplay = document.getElementById('resumenSS');
const resumenIRPFDisplay = document.getElementById('resumenIRPF');
const resumenNetoAnualDisplay = document.getElementById('resumenNetoAnual');

// --- Utilidades ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- Lógica de cálculo ---
function calcularIRPF() {
    try {
        // 1. VALIDAR Y OBTENER VALORES DE ENTRADA
        let salarioBruto = parseFloat(salarioBrutoInput.value) || 0;

        // Validación de salario
        if (salarioBruto < 0) salarioBruto = 0;
        if (salarioBruto > 1000000) salarioBruto = 1000000;

        // Evitar bucles raros con redondeos
        salarioBruto = Math.round(salarioBruto * 100) / 100;

        const situacionFamiliar = situacionFamiliarSelect.value;
        let numeroHijos = parseInt(hijosInput.value) || 0;
        if (numeroHijos < 0) numeroHijos = 0;
        if (numeroHijos > 20) numeroHijos = 20;

        const gradoDiscapacidad = discapacidadSelect.value;

        const numeroPagas = parseInt(pagasSelect.value) || 12;
        const comunidadAutonoma = comunidadAutonomaSelect.value;

        if (salarioBruto <= 0) {
            actualizarResultados(0, 0, 0, 0, 0, 0);
            return;
        }

        // 2. CÁLCULO DE COTIZACIONES A LA SEGURIDAD SOCIAL
        const baseCotizacionMin = CONFIG.COTIZACION_SS.BASE_MIN;
        const baseCotizacionMax = CONFIG.COTIZACION_SS.BASE_MAX;

        let baseCotizacion = salarioBruto;
        if (baseCotizacion < baseCotizacionMin) baseCotizacion = baseCotizacionMin;
        if (baseCotizacion > baseCotizacionMax) baseCotizacion = baseCotizacionMax;

        const cotizacionSS = baseCotizacion * CONFIG.COTIZACION_SS.TOTAL;

        // 3. GASTOS DEDUCIBLES
        const rendimientoNeto = salarioBruto - cotizacionSS;
        let gastosDeducibles = 0;

        // Reducción por rendimientos del trabajo (Art 20 LIRPF aproximado)
        if (rendimientoNeto <= 14047.50) {
            gastosDeducibles = 5565;
        } else if (rendimientoNeto < 19747.50) {
            gastosDeducibles = 5565 - ((rendimientoNeto - 14047.50) * 1.5);
            if (gastosDeducibles < 0) gastosDeducibles = 0;
        } else {
            gastosDeducibles = 0; // Ojo, la calculadora original asumía 0 aquí, pero hay un gasto fijo de 2000€.
            // La original no sumaba los 2000€ generales, solo la reducción variable.
            // Para mantener fidelidad con la lógica anterior (como "mejora" no intrusiva),
            // mantendré la lógica original pero estructurada.
            // *Nota*: Realmente todos tienen 2000€ de gastos deducibles mínimos.
            // Si el código original no lo tenía, era un "bug" de la calculadora simplificada.
            // Voy a ceñirme a la lógica original por ahora en este paso de refactoring.
        }

        // 4. BASE SUJETA A RETENCIÓN
        let baseSujetaARetencion = rendimientoNeto - gastosDeducibles;
        if (baseSujetaARetencion < 0) baseSujetaARetencion = 0;

        // 5. MÍNIMO PERSONAL Y FAMILIAR
        let minimoPersonal = CONFIG.IRPF.MINIMO_PERSONAL;

        // Aumento por discapacidad del contribuyente
        if (gradoDiscapacidad === "33") {
            minimoPersonal += CONFIG.IRPF.MINIMO_DISCAPACIDAD["33"];
        } else if (gradoDiscapacidad === "65") {
            minimoPersonal += CONFIG.IRPF.MINIMO_DISCAPACIDAD["65"];
            // Asumimos gastos de asistencia para >= 65% (simplificación)
            // +3000€ gastos de asistencia
            minimoPersonal += 3000;
        }

        // Mínimo por descendientes
        let minimoFamiliar = 0;
        // Logic original simple:
        if (numeroHijos >= 1) minimoFamiliar += CONFIG.IRPF.MINIMO_DESCENDIENTES[1];
        if (numeroHijos >= 2) minimoFamiliar += CONFIG.IRPF.MINIMO_DESCENDIENTES[2];
        if (numeroHijos >= 3) minimoFamiliar += CONFIG.IRPF.MINIMO_DESCENDIENTES[3];
        if (numeroHijos >= 4) minimoFamiliar += CONFIG.IRPF.MINIMO_DESCENDIENTES[4] * (numeroHijos - 3);

        const minimoTotal = minimoPersonal + minimoFamiliar;

        // 6. CÁLCULO DE LA CUOTA ÍNTEGRA
        const calcularCuota = (base, comunidad) => {
            const tramosEstatal = CONFIG.IRPF.TRAMOS_ESTATAL;

            let cuotaEstatal = 0;
            let baseRestante = base;

            for (let i = tramosEstatal.length - 1; i >= 0; i--) {
                if (baseRestante > tramosEstatal[i].limite) {
                    cuotaEstatal += (baseRestante - tramosEstatal[i].limite) * tramosEstatal[i].tipo;
                    baseRestante = tramosEstatal[i].limite;
                }
            }

            // Tramos autonómicos
            let cuotaAutonomica = 0;
            const tramosAuto = tramosAutonomicos[comunidad] || [];
            baseRestante = base;

            for (let i = tramosAuto.length - 1; i >= 0; i--) {
                if (baseRestante > tramosAuto[i].limite) {
                    cuotaAutonomica += (baseRestante - tramosAuto[i].limite) * tramosAuto[i].tipo;
                    baseRestante = tramosAuto[i].limite;
                }
            }

            return cuotaEstatal + cuotaAutonomica;
        };

        const cuotaBaseImponible = calcularCuota(baseSujetaARetencion, comunidadAutonoma);
        const cuotaMinimo = calcularCuota(minimoTotal, comunidadAutonoma);

        // 7. RESULTADOS FINALES
        let retencionIRPF = cuotaBaseImponible - cuotaMinimo;
        if (retencionIRPF < 0) retencionIRPF = 0;

        const salarioNetoAnual = salarioBruto - cotizacionSS - retencionIRPF;
        const salarioNetoMensual = salarioNetoAnual / numeroPagas;
        const porcentajeRetencion = salarioBruto > 0 ? (retencionIRPF / salarioBruto) * 100 : 0;

        actualizarResultados(salarioNetoMensual, salarioNetoAnual, porcentajeRetencion, salarioBruto, cotizacionSS, retencionIRPF);
    } catch (error) {
        console.error('Error en el cálculo de IRPF:', error);
        actualizarResultados(0, 0, 0, 0, 0, 0);
    }
}

function actualizarResultados(netoMes, netoAnual, porcRet, bruto, ss, irpf) {
    const formatCurrency = (value) => value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

    salarioNetoDisplay.textContent = formatCurrency(netoMes);
    salarioNetoAnualDisplay.textContent = formatCurrency(netoAnual);
    retencionPorcentajeDisplay.textContent = `${porcRet.toFixed(2).replace('.', ',')} %`;

    resumenBrutoDisplay.textContent = formatCurrency(bruto);
    resumenSSDisplay.textContent = `- ${formatCurrency(ss)}`;
    resumenIRPFDisplay.textContent = `- ${formatCurrency(irpf)}`;
    resumenNetoAnualDisplay.textContent = formatCurrency(netoAnual);
}

// --- Inicialización y Event Listeners ---

// Debounce para inputs de texto/número
const calcularIRPFDebounced = debounce(calcularIRPF, 300);

salarioBrutoInput.addEventListener('input', calcularIRPFDebounced);
hijosInput.addEventListener('input', calcularIRPFDebounced);

// Cambio inmediato para selects
situacionFamiliarSelect.addEventListener('change', calcularIRPF);
discapacidadSelect.addEventListener('change', calcularIRPF);
pagasSelect.addEventListener('change', calcularIRPF);
comunidadAutonomaSelect.addEventListener('change', calcularIRPF);

// Lógica del Acordeón
document.querySelectorAll('.accordion-button').forEach(button => {
    button.addEventListener('click', () => {
        const accordionContent = button.nextElementSibling;
        const isOpen = button.classList.contains('open');

        button.classList.toggle('open');

        if (!isOpen) {
            accordionContent.style.maxHeight = accordionContent.scrollHeight + 'px';
            button.setAttribute('aria-expanded', 'true');
        } else {
            accordionContent.style.maxHeight = '0';
            button.setAttribute('aria-expanded', 'false');
        }
    });
});

// Cálculo inicial
window.addEventListener('load', calcularIRPF);

// Exponer funcion al ambito global por si el boton la llama (aunque deberiamos quitar el onclick del HTML)
window.calcularIRPF = calcularIRPF;
