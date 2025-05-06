// TabHibernate - utils.js

// Animate counter from current to target value
function animateCounter(element, targetValue, duration = 800, suffix = "") {
    if (!element) {
        console.warn("animateCounter: Provided element is null or undefined.");
        return;
    }
    const currentValue = Number.parseInt(element.textContent) || 0;
    const stepTime = 20; // ms
    const steps = Math.max(1, duration / stepTime); // Avoid division by zero or too few steps
    const increment = (targetValue - currentValue) / steps;

    let currentStep = 0;
    const timer = setInterval(() => {
        currentStep++;
        const newValue = Math.round(currentValue + increment * currentStep);
        element.textContent = newValue + suffix;

        if (currentStep >= steps) {
            element.textContent = targetValue + suffix;
            clearInterval(timer);
        }
    }, stepTime);
} 