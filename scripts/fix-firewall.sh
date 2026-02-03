#!/bin/bash
# Auto Fix Firewall for Web Server Ports (80, 443)
# Run this script on your VM to open web server ports

echo "=================================================="
echo "🔥 Firewall Port Opener for Web Server"
echo "   Opening ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)"
echo "=================================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  This script needs sudo privileges"
    echo "    Re-running with sudo..."
    sudo "$0" "$@"
    exit $?
fi

echo "🔍 Detecting firewall system..."

# Detect and configure firewall
if command -v firewall-cmd &> /dev/null; then
    echo "📦 Detected: firewalld (Oracle Linux/CentOS/RHEL)"
    echo ""
    
    # Check if firewalld is running
    if systemctl is-active --quiet firewalld; then
        echo "✅ Firewalld is running"
        
        # Add HTTP/HTTPS services
        echo "   Adding HTTP service..."
        firewall-cmd --permanent --add-service=http
        
        echo "   Adding HTTPS service..."
        firewall-cmd --permanent --add-service=https
        
        # Add specific ports (backup)
        echo "   Adding port 80/tcp..."
        firewall-cmd --permanent --add-port=80/tcp
        
        echo "   Adding port 443/tcp..."
        firewall-cmd --permanent --add-port=443/tcp
        
        echo "   Adding port 22/tcp (SSH)..."
        firewall-cmd --permanent --add-port=22/tcp
        
        # Reload firewall
        echo "   Reloading firewall..."
        firewall-cmd --reload
        
        echo ""
        echo "✅ Firewalld configured successfully!"
        echo ""
        echo "📋 Current firewall rules:"
        firewall-cmd --list-all
        
    else
        echo "⚠️  Firewalld is installed but not running"
        echo "   Starting firewalld..."
        systemctl start firewalld
        systemctl enable firewalld
        
        # Retry configuration
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --permanent --add-port=80/tcp
        firewall-cmd --permanent --add-port=443/tcp
        firewall-cmd --permanent --add-port=22/tcp
        firewall-cmd --reload
        
        echo "✅ Firewalld started and configured!"
    fi

elif command -v ufw &> /dev/null; then
    echo "📦 Detected: UFW (Ubuntu/Debian)"
    echo ""
    
    # Check if UFW is active
    UFW_STATUS=$(ufw status | head -n 1)
    
    echo "   Adding SSH rule..."
    ufw allow 22/tcp
    
    echo "   Adding HTTP rule..."
    ufw allow 80/tcp
    
    echo "   Adding HTTPS rule..."
    ufw allow 443/tcp
    
    # Enable UFW if not already enabled
    if [[ $UFW_STATUS == *"inactive"* ]]; then
        echo "   Enabling UFW..."
        echo "y" | ufw enable
    fi
    
    echo ""
    echo "✅ UFW configured successfully!"
    echo ""
    echo "📋 Current firewall rules:"
    ufw status numbered

elif command -v iptables &> /dev/null; then
    echo "📦 Detected: iptables"
    echo ""
    
    echo "   Adding SSH rule (port 22)..."
    iptables -C INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 22 -j ACCEPT
    
    echo "   Adding HTTP rule (port 80)..."
    iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80 -j ACCEPT
    
    echo "   Adding HTTPS rule (port 443)..."
    iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
    
    # Try to save rules
    echo "   Saving iptables rules..."
    if [ -f /etc/init.d/iptables ]; then
        service iptables save
    elif command -v iptables-save &> /dev/null; then
        if [ ! -d /etc/iptables ]; then
            mkdir -p /etc/iptables
        fi
        iptables-save > /etc/iptables/rules.v4
    fi
    
    echo ""
    echo "✅ IPTables configured successfully!"
    echo ""
    echo "📋 Current iptables rules for ports 22, 80, 443:"
    iptables -L INPUT -n -v | grep -E 'dpt:(22|80|443)'

else
    echo "⚠️  No firewall system detected"
    echo "    Your system may not have a firewall, or it's already configured"
fi

echo ""
echo "=================================================="
echo "🧪 Testing Connectivity"
echo "=================================================="

# Get VM IP
VM_IP=$(hostname -I | awk '{print $1}')
echo "VM IP Address: $VM_IP"
echo ""

# Test if web server is running
echo "🔍 Checking if web server is running..."
if netstat -tulpn 2>/dev/null | grep -q ':80 ' || ss -tulpn 2>/dev/null | grep -q ':80 '; then
    echo "✅ Web server is listening on port 80"
    
    echo ""
    echo "Testing HTTP locally..."
    curl -I -s http://localhost | head -n 1
else
    echo "⚠️  No web server detected on port 80"
    echo "    Install and start nginx or apache:"
    echo "    Ubuntu: sudo apt install nginx -y && sudo systemctl start nginx"
    echo "    Oracle Linux: sudo yum install nginx -y && sudo systemctl start nginx"
fi

echo ""
echo "=================================================="
echo "✅ Firewall Configuration Complete!"
echo "=================================================="
echo ""
echo "📝 Next Steps:"
echo "   1. Install web server (if not installed):"
echo "      Ubuntu: sudo apt install nginx -y"
echo "      Oracle Linux: sudo yum install nginx -y"
echo ""
echo "   2. Start web server:"
echo "      sudo systemctl start nginx"
echo "      sudo systemctl enable nginx"
echo ""
echo "   3. Test from external machine:"
echo "      curl http://$VM_IP"
echo ""
echo "   4. Configure your domain to point to: $VM_IP"
echo ""
echo "💡 Tip: Check nginx status: sudo systemctl status nginx"
echo "=================================================="
